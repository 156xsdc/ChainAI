/**
 * DeepSeek 导出导入（一个会话 = 一棵树，一问一答 = 一个节点）
 *
 * 源数据格式（导出包 export_format_version 3）：
 *   chat_sessions/<uuid>.json
 *   {
 *     id, title, inserted_at, updated_at, current_message_id,
 *     messages: [{
 *       id, parent_id, role: "USER" | "ASSISTANT", inserted_at,
 *       fragments: [{ type: "REQUEST" | "RESPONSE" | "THINK" | "FILE" | ... , content }]
 *     }]
 *   }
 *
 * 要点：
 * - messages 是**树**不是链（重新生成/编辑会产生分支）。导入时沿
 *   current_message_id 的 parent_id 链回溯，只取"用户当前看到的那条路径"。
 * - USER 的 REQUEST = 问题；ASSISTANT 的 RESPONSE = 回答；THINK = 思考过程；
 *   FILE / TOOL_SEARCH / TOOL_OPEN / CONTENT_RISK / TIP 是附件与工具痕迹，跳过。
 * - 附件图片不导入（节点模型没有附件字段），仅在统计里提示数量。
 */
import type { AppRepositories } from "../db";

export interface DeepSeekQa {
  question: string;
  answer: string;
  /** 思考过程（DeepSeek R1 的 THINK 片段） */
  reasoning: string;
}

export interface DeepSeekSession {
  id: string;
  title: string;
  createdAt: string;
  /** 按时间顺序的问答对（一条链） */
  qa: DeepSeekQa[];
  /** 实际采用了当前分支路径（存在被丢弃的分支） */
  hasBranches: boolean;
  /** 被跳过的消息数（工具调用 / 无内容等） */
  skippedMessages: number;
}

interface RawFragment {
  type?: string;
  content?: string;
}

interface RawMessage {
  id?: number | string;
  parent_id?: number | string | null;
  role?: string;
  fragments?: RawFragment[];
}

/** 拼接某类片段的内容 */
function fragmentsText(msg: RawMessage, type: string): string {
  return (msg.fragments ?? [])
    .filter((f) => f?.type === type && typeof f.content === "string")
    .map((f) => (f.content as string).trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 沿 parent_id 回溯出「当前分支」的消息顺序（旧 → 新）
 * current_message_id 缺失/找不到时退化为按数组顺序
 */
function pathToCurrent(messages: RawMessage[], currentId?: unknown): RawMessage[] {
  const byId = new Map<string, RawMessage>();
  for (const m of messages) {
    if (m?.id !== undefined && m?.id !== null) byId.set(String(m.id), m);
  }
  const start =
    currentId !== undefined && currentId !== null
      ? byId.get(String(currentId))
      : messages[messages.length - 1];

  const out: RawMessage[] = [];
  const seen = new Set<string>();
  let cur: RawMessage | undefined = start;
  while (cur) {
    const key = cur.id === undefined ? "" : String(cur.id);
    if (key && seen.has(key)) break; // 防环
    if (key) seen.add(key);
    out.push(cur);
    const pid = cur.parent_id;
    cur = pid === null || pid === undefined ? undefined : byId.get(String(pid));
  }
  return out.reverse();
}

/** 解析单个会话 JSON → 会话结构（纯函数，便于测试） */
export function parseDeepSeekSession(raw: unknown): DeepSeekSession {
  const data = (raw ?? {}) as {
    id?: string;
    title?: string;
    inserted_at?: string;
    current_message_id?: unknown;
    messages?: RawMessage[];
  };
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const path = pathToCurrent(messages, data.current_message_id);

  const qa: DeepSeekQa[] = [];
  let pending: { question: string; reasoning: string } | null = null;
  let skippedMessages = 0;

  for (const msg of path) {
    const role = (msg.role ?? "").toUpperCase();
    if (role === "USER") {
      const question = fragmentsText(msg, "REQUEST");
      if (!question) {
        skippedMessages++;
        continue;
      }
      // 上一条问题还没等到回答就先落库（避免丢内容）
      if (pending) {
        qa.push({ question: pending.question, answer: "", reasoning: pending.reasoning });
      }
      pending = { question, reasoning: "" };
      continue;
    }
    if (role === "ASSISTANT") {
      const answer = fragmentsText(msg, "RESPONSE");
      const reasoning = fragmentsText(msg, "THINK");
      if (!answer && !reasoning) {
        skippedMessages++;
        continue;
      }
      if (pending) {
        qa.push({ question: pending.question, answer, reasoning });
        pending = null;
      } else {
        // 没有对应问题的回答（例如续写）：作为独立节点保留
        qa.push({ question: "（无提问的回答）", answer, reasoning });
      }
    }
  }
  if (pending) {
    qa.push({ question: pending.question, answer: "", reasoning: pending.reasoning });
  }

  return {
    id: data.id ?? "",
    title: (data.title ?? "").trim() || "（未命名会话）",
    createdAt: data.inserted_at ?? "",
    qa,
    hasBranches: path.length < messages.length,
    skippedMessages,
  };
}

export interface DeepSeekImportSummary {
  /** 成功建树数量 */
  trees: number;
  /** 创建节点数量 */
  nodes: number;
  /** 跳过的会话（无问答内容） */
  skippedSessions: string[];
  /** 树名 */
  names: string[];
}

export interface DeepSeekImportOptions {
  /** 树的默认继承条数（来自设置 ai.defaultInheritCount） */
  inheritCount?: number;
  /** 已存在的树名（用于去重） */
  existingNames?: string[];
}

/** 树名去重：重名时追加 (2) (3)… */
function uniqueName(base: string, used: Set<string>): string {
  const name = base.trim() || "（未命名会话）";
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name} (${i})`)) i++;
  const next = `${name} (${i})`;
  used.add(next);
  return next;
}

/**
 * 把解析后的会话写入数据库：每个会话一棵树，问答按顺序连成一条链。
 * 直接建树 + 建节点 + 建边（不走 UI 的 navigateTo，避免导入过程中频繁切树）。
 */
export async function importDeepSeekSessions(
  repos: AppRepositories,
  sessions: DeepSeekSession[],
  options: DeepSeekImportOptions = {}
): Promise<DeepSeekImportSummary> {
  const inheritCount =
    options.inheritCount ??
    (await repos.settings.get<number>("ai.defaultInheritCount", 5));

  const used = new Set<string>(options.existingNames ?? []);
  const summary: DeepSeekImportSummary = {
    trees: 0,
    nodes: 0,
    skippedSessions: [],
    names: [],
  };

  for (const session of sessions) {
    if (session.qa.length === 0) {
      summary.skippedSessions.push(session.title);
      continue;
    }
    const name = uniqueName(session.title, used);
    const tree = await repos.trees.create({
      name,
      inheritMode: "count",
      inheritCount,
    });
    summary.trees++;
    summary.names.push(name);

    let parentId: string | null = null;
    for (const item of session.qa) {
      const node = await repos.nodes.createNode({
        question: item.question,
        answer: item.answer,
        reasoning: item.reasoning,
        treeId: tree.id,
      });
      if (parentId) {
        await repos.nodes.addEdge(parentId, node.id, "inherit");
      }
      parentId = node.id;
      summary.nodes++;
    }
  }

  return summary;
}

/**
 * 发送上下文统一流水线（首次发送 / 重新生成 / 发送前预检 三处共用）
 *
 * 之前三处各写一套：
 * - sendMessage：collect → 截取 → 压缩 → 引用注入
 * - 预检：collect → 截取（不压缩）→ 估算  ← 与真实发送不一致，会误判超限
 * - regenerate：collect → 全量发出     ← 完全绕过继承/压缩
 *
 * 现在统一走 prepareOutgoing：策略解析 → 收集路径 → plan（可估算）→
 * materialize（调 AI 摘要）→ 引用注入，只保留一个语义。
 */
import {
  materializeContext,
  planContext,
  type ContextMessage,
  type ContextPlan,
} from "./builder";
import {
  loadCompressionSettings,
  resolveInheritPolicy,
  type CompressionSettings,
  type InheritPolicy,
  type PolicyDeps,
} from "./policy";
import { estimateMessagesTokens } from "./tokenEstimate";

export interface QuoteRef {
  nodeId: string;
  text: string;
}

export interface PrepareInput {
  /** 目标节点；预检时传当前（父）节点，nodeId 为 null 表示还没有任何上下文 */
  nodeId: string | null;
  /** 追加一条尚未落库的用户消息（发送前预检用） */
  appendUserMessage?: string;
  /** 重新生成：去掉末尾的 assistant（旧回答），只保留问题 */
  dropTrailingAssistant?: boolean;
  /** 引用：带出处节点（可还原被引用节点的问答） */
  quote?: QuoteRef | null;
  /** 引用：只有文本（重新生成时库里只存了引用文本） */
  quoteText?: string;
  /** 压缩设置；不传则读库 */
  compression?: CompressionSettings;
  /** AI 摘要函数；estimateOnly 时不调用 */
  compressFn?: (group: ContextMessage[]) => Promise<string>;
  /** 只估算不调 AI（预检） */
  estimateOnly?: boolean;
}

export interface PrepareResult {
  /** 最终发给模型的消息（estimateOnly 时为空数组） */
  messages: ContextMessage[];
  plan: ContextPlan;
  policy: InheritPolicy;
  isMerge: boolean;
  /** 本次发送的 token 估算（estimateOnly 时是压缩后的预算推算） */
  estimatedTokens: number;
  /** 压缩掉的比例（0~1，用于提示） */
  compressionRatio: number;
}

/** 引用注入：把「被引用问答 + 带引用的提问」替换掉末尾的当前问题 */
function applyQuote(
  messages: ContextMessage[],
  question: string,
  quoteText: string,
  quoteNode: { question?: string; answer?: string } | null
): ContextMessage[] {
  if (!quoteText) return messages;
  const next = [...messages];
  while (next.length > 0 && next[next.length - 1].role === "user") next.pop();
  if (quoteNode?.question) next.push({ role: "user", content: quoteNode.question });
  if (quoteNode?.answer) {
    next.push({ role: "assistant", content: quoteNode.answer });
  }
  next.push({
    role: "user",
    content: `【引用内容】\n${quoteText}\n\n请结合以上引用及其出处上下文，回答：${question}`,
  });
  return next;
}

export async function prepareOutgoing(
  deps: PolicyDeps,
  input: PrepareInput
): Promise<PrepareResult> {
  const { repos, treeService } = deps;
  const compression =
    input.compression ?? (await loadCompressionSettings(repos));
  const policy = await resolveInheritPolicy(deps, input.nodeId);

  // 合并节点（多父）：每条父链各自截取，不能全局二次截断
  const parentLinks = input.nodeId
    ? await repos.nodes.getParentsWithEdge(input.nodeId)
    : [];
  const isMerge = parentLinks.length > 1;

  let full: ContextMessage[] = [];
  if (policy.mode !== "none" && input.nodeId) {
    const path = isMerge
      ? await treeService.getMergeContextPath(
          input.nodeId,
          Math.max(1, policy.count)
        )
      : await treeService.getContextPath(input.nodeId);
    full = path.map((m) => ({ role: m.role, content: m.content }));
  }

  if (input.dropTrailingAssistant) {
    while (full.length > 0 && full[full.length - 1].role === "assistant") {
      full.pop();
    }
  }
  if (input.appendUserMessage) {
    full.push({ role: "user", content: input.appendUserMessage });
  }

  const plan = planContext(full, {
    inheritMode: policy.mode,
    inheritCount: policy.count,
    // 合并节点已按父链截好，plan 里不再全局截断
    perChain: isMerge,
    compress: compression.enabled,
    recentKeep: compression.recentKeep,
  });

  // 当前问题：优先用刚输入的那条 → 路径里最后一条用户消息 → 节点自身的问题
  // （不继承模式下路径为空，必须回落到节点自己的问题，否则上下文会一条不剩）
  const lastUser = [...full].reverse().find((m) => m.role === "user");
  let question = input.appendUserMessage ?? lastUser?.content ?? "";
  if (!question && input.nodeId) {
    const selfNode = await repos.nodes.getNode(input.nodeId);
    question = selfNode?.question ?? "";
  }

  const quoteNode = input.quote
    ? await repos.nodes.getNode(input.quote.nodeId)
    : null;
  const quoteText = input.quote?.text ?? input.quoteText ?? "";

  /** 不继承/上下文为空时的兜底消息 */
  const fallback: ContextMessage[] =
    plan.recentCount === 0 && plan.groups.length === 0 && question
      ? [{ role: "user", content: question }]
      : [];

  const compressionRatio =
    plan.rawTokens > 0 && !input.estimateOnly
      ? Math.max(0, 1 - plan.estimatedTokens / plan.rawTokens)
      : 0;

  // 预检：只用 plan 的预算推算，不花 AI 调用
  if (input.estimateOnly) {
    const baseTokens =
      plan.estimatedTokens + estimateMessagesTokens(fallback);
    const quoteExtra: ContextMessage[] = [];
    if (quoteText) {
      if (quoteNode?.question) {
        quoteExtra.push({ role: "user", content: quoteNode.question });
      }
      if (quoteNode?.answer) {
        quoteExtra.push({ role: "assistant", content: quoteNode.answer });
      }
      quoteExtra.push({ role: "user", content: `${quoteText}${question}` });
    }
    return {
      messages: [],
      plan,
      policy,
      isMerge,
      estimatedTokens: baseTokens + estimateMessagesTokens(quoteExtra),
      compressionRatio,
    };
  }

  // 真实发送：生成摘要（受预算约束）+ 引用注入 + 兜底
  let messages = await materializeContext(plan, {
    compressFn: input.compressFn,
  });
  messages = applyQuote(messages, question, quoteText, quoteNode);
  if (messages.length === 0 && question) {
    messages.push({ role: "user", content: question });
  }

  return {
    messages,
    plan,
    policy,
    isMerge,
    estimatedTokens: estimateMessagesTokens(messages),
    compressionRatio,
  };
}

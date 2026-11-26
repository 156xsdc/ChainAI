/**
 * 上下文构建：继承范围 + 时间权重压缩（预算驱动）
 *
 * 分两步，保证「估算」和「实际发送」是同一套逻辑：
 *
 * 1) `planContext` —— 纯计算，不调 AI
 *    - 按继承模式截取（count / all / none；合并节点用 perChain 表示已按父链截好）
 *    - 最近 recentKeep 条完整保留，更早的消息按时间权重区间分组
 *    - 每个区间算出「摘要字数预算」= 该组原文长度 × 权重（0.7 / 0.4 / 0.2 / 0.1）
 *    - 输出压缩后的 token 估算 —— **发送前预检用的就是这份估算**
 *
 * 2) `materializeContext` —— 真正调 AI 生成摘要，按预算裁剪后产出最终消息
 *    - 所有区间摘要合并成**一条 system 消息**（不再伪装成用户说过的话）
 *    - 摘要超预算按字数硬截断；生成失败降级为「原文按预算截断」
 *
 * 时间权重的含义因此变得真实：距离越远，允许保留的信息量比例越低。
 */
import { WEIGHT_BANDS, bandLabelForIndex, weightForIndex } from "./weights";
import { estimateMessagesTokens } from "./tokenEstimate";
import type { ChatImage } from "../ai/types";

export interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** 随该消息发送的图片（仅 user 消息，多模态） */
  images?: ChatImage[];
}

/** 一个需要摘要的时间权重区间 */
export interface SummaryGroup {
  /** 区间下标（WEIGHT_BANDS 的索引） */
  band: number;
  /** 区间标签，如「轻度压缩」 */
  label: string;
  /** 保留权重 0~1 */
  weight: number;
  messages: ContextMessage[];
  /** 原文长度（字符） */
  rawChars: number;
  /** 摘要预算（字符）= rawChars × weight */
  budgetChars: number;
  /** 原文 token 估算 */
  rawTokens: number;
}

/** 上下文计划：可估算、可物化 */
export interface ContextPlan {
  /** 完整保留原文的最近消息（从旧到新） */
  recent: ContextMessage[];
  /** 需摘要的历史区间（从旧到新） */
  groups: SummaryGroup[];
  /** 被 count 模式丢弃的条数 */
  droppedCount: number;
  /** 截取后的原文总字符数 */
  rawChars: number;
  /** 截取后的原文 token 估算 */
  rawTokens: number;
  /** 压缩后的 token 估算（= 预检依据） */
  estimatedTokens: number;
  /** 完整保留的条数 */
  recentCount: number;
}

export interface PlanOptions {
  /** 继承模式 */
  inheritMode: "all" | "count" | "none";
  /** inheritMode=count 时的条数（消息条数，一问一答算 2 条） */
  inheritCount?: number;
  /**
   * 合并节点（多父）：消息已按「每条父链各 N 条」截取，
   * 这里不再做全局截断（否则会把后创建的父链整条切掉）
   */
  perChain?: boolean;
  /** 是否启用时间权重压缩（默认 true） */
  compress?: boolean;
  /** 最近几条完整保留（默认 5 条消息） */
  recentKeep?: number;
}

/** 摘要正文最小预算：低于此值不值得调一次 AI，直接按预算截断原文 */
const MIN_SUMMARY_BUDGET = 40;
/** 每条摘要的固定开销（标签、分隔符）按 token 计 */
const SUMMARY_OVERHEAD_TOKENS = 8;
/** 摘要消息头 */
const SUMMARY_HEADER = "【更早对话摘要】";

/** 开启压缩时的默认保留条数（消息条数） */
export const DEFAULT_RECENT_KEEP = 5;

const charCount = (msgs: ContextMessage[]): number =>
  msgs.reduce((sum, m) => sum + m.content.length, 0);

const tokenCount = (msgs: ContextMessage[]): number =>
  estimateMessagesTokens(msgs);

/** 按预算截断（预算内原样返回） */
function truncate(text: string, budgetChars: number): string {
  if (text.length <= budgetChars) return text;
  return `${text.slice(0, Math.max(1, budgetChars))}…`;
}

/**
 * 计算上下文计划（纯计算，不调 AI）
 * @param fullMessages 完整路径消息（从旧到新，最后一条通常是当前问题）
 */
export function planContext(
  fullMessages: ContextMessage[],
  options: PlanOptions
): ContextPlan {
  const {
    inheritMode,
    inheritCount,
    perChain,
    compress,
    recentKeep = DEFAULT_RECENT_KEEP,
  } = options;

  if (inheritMode === "none" || fullMessages.length === 0) {
    return {
      recent: [],
      groups: [],
      droppedCount: fullMessages.length,
      rawChars: 0,
      rawTokens: 0,
      estimatedTokens: 0,
      recentCount: 0,
    };
  }

  // 1. 继承范围（合并节点已按父链截好，跳过全局截断）
  let selected = fullMessages;
  let droppedCount = 0;
  if (inheritMode === "count" && !perChain) {
    const n = Math.max(1, inheritCount ?? DEFAULT_RECENT_KEEP);
    if (selected.length > n) {
      droppedCount = selected.length - n;
      selected = selected.slice(-n);
    }
  }

  const rawChars = charCount(selected);
  const rawTokens = tokenCount(selected);

  // 2. 时间权重分区：最近 N 条原文，更早的按区间摘要
  const compressOn = compress !== false && selected.length > recentKeep;
  const keepCount = compressOn
    ? Math.min(recentKeep, selected.length)
    : selected.length;
  const recent = selected.slice(selected.length - keepCount);
  const older = selected.slice(0, selected.length - keepCount);
  const groups =
    older.length > 0
      ? groupByWeight(older, keepCount + older.length - 1)
      : [];

  // 3. 压缩后的估算：原文保留部分 + 每组「按权重折算」的 token + 固定开销
  const estimatedTokens =
    tokenCount(recent) +
    groups.reduce(
      (sum, g) =>
        sum + Math.max(1, Math.ceil(g.rawTokens * g.weight)) + SUMMARY_OVERHEAD_TOKENS,
      0
    );

  return {
    recent,
    groups,
    droppedCount,
    rawChars,
    rawTokens,
    estimatedTokens,
    recentCount: recent.length,
  };
}

/**
 * 按时间权重区间分组（保持组序从旧到新），并算出每组的摘要预算
 * @param messages 从旧到新的待压缩消息
 * @param baseIndexFromLatest messages[0] 在「从最近一条算起」坐标系里的序号
 *        （0 = 全量最近一条）
 */
export function groupByWeight(
  messages: ContextMessage[],
  baseIndexFromLatest = messages.length - 1
): SummaryGroup[] {
  const groups: SummaryGroup[] = [];
  let currentBand = Number.NaN;

  messages.forEach((m, i) => {
    const idxFromLatest = baseIndexFromLatest - i; // 越旧序号越大
    const band = WEIGHT_BANDS.findIndex(
      (b) => idxFromLatest >= b.minIndex && idxFromLatest <= b.maxIndex
    );
    if (band !== currentBand) {
      currentBand = band;
      groups.push({
        band,
        label: bandLabelForIndex(idxFromLatest),
        weight: weightForIndex(idxFromLatest),
        messages: [],
        rawChars: 0,
        budgetChars: 0,
        rawTokens: 0,
      });
    }
    groups[groups.length - 1].messages.push(m);
  });

  for (const g of groups) {
    g.rawChars = charCount(g.messages);
    g.rawTokens = tokenCount(g.messages);
    // 权重在这里真正生效：预算 = 原文长度 × 权重
    g.budgetChars = Math.max(1, Math.round(g.rawChars * g.weight));
  }
  return groups;
}

export interface MaterializeOptions {
  /** AI 压缩函数：输入一组旧消息，输出摘要（依赖注入，便于测试） */
  compressFn?: (group: ContextMessage[]) => Promise<string>;
}

/** 把原文摊平成「用户/AI」记录，用于摘要失败时降级 */
function renderRaw(messages: ContextMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "用户" : m.role === "system" ? "系统" : "AI"}：${m.content}`)
    .join("\n");
}

/** 单组摘要：AI → 按预算截断；失败/无函数 → 原文按预算截断 */
async function compressGroup(
  group: SummaryGroup,
  compressFn?: (group: ContextMessage[]) => Promise<string>
): Promise<string> {
  const fallback = () => truncate(renderRaw(group.messages), group.budgetChars);
  if (!compressFn || group.budgetChars < MIN_SUMMARY_BUDGET) return fallback();
  try {
    const summary = (await compressFn(group.messages))?.trim();
    if (!summary) return fallback();
    return truncate(summary, group.budgetChars);
  } catch {
    return fallback();
  }
}

/**
 * 物化上下文：生成摘要并按预算裁剪，返回最终发给模型的消息
 * 所有摘要合并为一条 system 消息，避免污染「用户说过的话」
 */
export async function materializeContext(
  plan: ContextPlan,
  options: MaterializeOptions = {}
): Promise<ContextMessage[]> {
  const parts: ContextMessage[] = [];
  if (plan.groups.length > 0) {
    const lines: string[] = [];
    for (const group of plan.groups) {
      const text = await compressGroup(group, options.compressFn);
      if (text) {
        lines.push(`[${group.label} · ${group.messages.length} 条] ${text}`);
      }
    }
    if (lines.length > 0) {
      parts.push({
        role: "system",
        content: `${SUMMARY_HEADER}\n${lines.join("\n")}`,
      });
    }
  }
  return [...parts, ...plan.recent];
}

export interface BuildContextOptions extends PlanOptions, MaterializeOptions {}

/**
 * 便捷入口：plan + materialize（保留旧调用风格）
 * 需要「只估算不调 AI」时请直接用 planContext。
 */
export async function buildContext(
  fullMessages: ContextMessage[],
  options: BuildContextOptions
): Promise<ContextMessage[]> {
  return materializeContext(planContext(fullMessages, options), {
    compressFn: options.compressFn,
  });
}

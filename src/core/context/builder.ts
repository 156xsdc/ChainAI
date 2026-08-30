/**
 * 上下文构建器：继承模式 + 时间权重压缩
 *
 * 流程：
 * 1. 按继承模式截取消息（全部 / 最近N条 / 不继承）
 * 2. 可选启用时间权重压缩：
 *    - 最近 recentKeep 条完整保留原文
 *    - 更早的消息按权重区间分组，每组调用 AI 生成摘要
 *    - 压缩失败自动降级为原文（不中断对话）
 * 3. 输出：旧摘要 → 新摘要 → 最近原文（从旧到新）
 */
import { WEIGHT_BANDS } from "./weights";

export interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface BuildContextOptions {
  /** 继承模式 */
  inheritMode: "all" | "count" | "none";
  /** inheritMode=count 时的条数 */
  inheritCount?: number;
  /** 是否启用时间权重压缩（默认 true） */
  compress?: boolean;
  /** 最近几条完整保留（默认 5，对应时间权重第一区间） */
  recentKeep?: number;
  /** AI 压缩函数：输入一组旧消息，输出摘要（依赖注入，便于测试） */
  compressFn?: (group: ContextMessage[]) => Promise<string>;
}

/**
 * 构建发送给 AI 的上下文
 * @param fullMessages 完整路径消息（从旧到新）
 */
export async function buildContext(
  fullMessages: ContextMessage[],
  options: BuildContextOptions
): Promise<ContextMessage[]> {
  const { inheritMode, inheritCount, compress, recentKeep = 5, compressFn } =
    options;

  if (inheritMode === "none" || fullMessages.length === 0) return [];

  // 1. 继承范围截取
  let selected = fullMessages;
  if (inheritMode === "count") {
    const n = Math.max(1, inheritCount ?? 10);
    selected = fullMessages.slice(-n);
  }

  // 2. 时间权重压缩
  if (
    compress !== false &&
    selected.length > recentKeep &&
    compressFn
  ) {
    const keepCount = Math.min(recentKeep, selected.length);
    const recent = selected.slice(selected.length - keepCount); // 最近原文（从旧到新）
    const older = selected.slice(0, selected.length - keepCount); // 需压缩的旧消息

    // 按权重区间分组：older 最旧消息的全局 idxFromLatest = keepCount + older.length - 1
    const groups = groupByWeight(older, keepCount + older.length - 1);
    try {
      const summaries: ContextMessage[] = [];
      // 从旧到新输出：旧组摘要在前
      for (const group of groups) {
        const summary = await compressFn(group);
        if (summary.trim()) {
          summaries.push({
            role: "user",
            content: `【更早对话摘要】${summary.trim()}`,
          });
        }
      }
      return [...summaries, ...recent];
    } catch {
      // 压缩失败：降级为原文
      return selected;
    }
  }

  return selected;
}

/**
 * 按时间权重区间对旧消息分组（保持组序从旧到新）
 * @param messages 从旧到新的消息数组
 * @param baseIndexFromLatest 数组最旧元素（messages[0]）在全量消息中的 idxFromLatest
 *   （0 = 全量最近一条；默认 n-1 表示该数组自身即"最近 n 条"）
 */
export function groupByWeight(
  messages: ContextMessage[],
  baseIndexFromLatest = messages.length - 1
): ContextMessage[][] {
  const n = messages.length;
  const groups: ContextMessage[][] = [];
  let currentBand = -1;

  for (let i = 0; i < n; i++) {
    const idxFromLatest = baseIndexFromLatest - i; // 越旧 idx 越大
    const band = WEIGHT_BANDS.findIndex(
      (b) => idxFromLatest >= b.minIndex && idxFromLatest <= b.maxIndex
    );
    if (band !== currentBand) {
      groups.push([]);
      currentBand = band;
    }
    groups[groups.length - 1].push(messages[i]);
  }
  return groups;
}

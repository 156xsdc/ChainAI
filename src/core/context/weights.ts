/**
 * 时间权重压缩：离当前越近的消息权重越大，越远压缩越激进
 *
 * 权重区间（对应需求文档）：
 * 最近 1-5 条    → 完整保留（权重 100%）
 * 6-15 条       → 轻度压缩（权重 70%）
 * 16-30 条      → 中度压缩（权重 40%）
 * 31-50 条      → 重度压缩（权重 20%）
 * 50 条以上     → 极简摘要（权重 10%）
 */

export interface WeightBand {
  /** 从最近一条算起的起始序号（含，最近一条 = 0） */
  minIndex: number;
  /** 结束序号（含），Infinity 表示无上限 */
  maxIndex: number;
  /** 保留权重 0~1 */
  weight: number;
  /** 摘要标签 */
  label: string;
}

export const WEIGHT_BANDS: WeightBand[] = [
  { minIndex: 0, maxIndex: 4, weight: 1.0, label: "完整保留" },
  { minIndex: 5, maxIndex: 14, weight: 0.7, label: "轻度压缩" },
  { minIndex: 15, maxIndex: 29, weight: 0.4, label: "中度压缩" },
  { minIndex: 30, maxIndex: 49, weight: 0.2, label: "重度压缩" },
  { minIndex: 50, maxIndex: Infinity, weight: 0.1, label: "极简摘要" },
];

/** 根据"从最近一条算起的序号"返回权重（0=最近一条） */
export function weightForIndex(indexFromLatest: number): number {
  const band = WEIGHT_BANDS.find(
    (b) => indexFromLatest >= b.minIndex && indexFromLatest <= b.maxIndex
  );
  return band?.weight ?? 1;
}

/** 返回序号所在的权重区间标签 */
export function bandLabelForIndex(indexFromLatest: number): string {
  const band = WEIGHT_BANDS.find(
    (b) => indexFromLatest >= b.minIndex && indexFromLatest <= b.maxIndex
  );
  return band?.label ?? "完整保留";
}

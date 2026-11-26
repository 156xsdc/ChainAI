/**
 * 资料上下文：把「文档 + 页码范围」变成可注入模型的一段文本
 *
 * 纯函数，便于测试。页码从 1 开始；"all" 或空 = 全部页。
 */
import { estimateTokens } from "../context/tokenEstimate";
import type { Document } from "../db";

export interface DocContextItem {
  /** 文档名（展示用） */
  name: string;
  /** 页码范围原文，如 "1-5" / "3" / "all" */
  range: string;
  /** 选中的页文本（已按页拆分） */
  pages: string[];
}

export interface DocContextBlock {
  /** 注入模型的整段文本 */
  text: string;
  /** token 估算 */
  tokens: number;
  /** 实际带上的页数 */
  pageCount: number;
  /** 规范化后的页码范围（如 "1-5"） */
  normalizedRange: string;
}

/**
 * 解析页码范围 → 0-based 页索引列表
 * 支持 "all"/""/"1-5"/"3"/"1,3,5"，非法输入按"全部"处理，越界自动裁剪
 */
export function parsePageRange(range: string, pageCount: number): number[] {
  const all = Array.from({ length: pageCount }, (_, i) => i);
  const text = (range ?? "").trim().toLowerCase();
  if (!text || text === "all" || text === "*") return all;

  const picked = new Set<number>();
  for (const part of text.split(/[,,]/)) {
    const seg = part.trim();
    if (!seg) continue;
    const m = /^(\d+)\s*[-~]\s*(\d+)$/.exec(seg);
    if (m) {
      const from = Math.min(Number(m[1]), Number(m[2]));
      const to = Math.max(Number(m[1]), Number(m[2]));
      for (let p = from; p <= to; p++) {
        if (p >= 1 && p <= pageCount) picked.add(p - 1);
      }
      continue;
    }
    const single = /^(\d+)$/.exec(seg);
    if (single) {
      const p = Number(single[1]);
      if (p >= 1 && p <= pageCount) picked.add(p - 1);
    }
  }
  // 完全解析不出来 → 退回全部（避免"看起来很聪明，实际什么都没发"）
  if (picked.size === 0) return all;
  return [...picked].sort((a, b) => a - b);
}

/** 0-based 索引 → 页码范围展示文本（连续区间合并） */
export function formatPageRange(indexes: number[]): string {
  if (indexes.length === 0) return "";
  const sorted = [...indexes].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    start = cur;
    prev = cur;
  }
  return parts.join(",");
}

/** 从文档里按页码范围取文本，生成注入块 */
export function buildDocContext(doc: Document, range: string): DocContextBlock {
  const indexes = parsePageRange(range, doc.pages.length);
  const picked = indexes.map((i) => doc.pages[i] ?? "");
  const normalizedRange = formatPageRange(indexes);
  const body = picked
    .map((text, i) => `--- 第 ${indexes[i] + 1} 页 ---\n${text.trim()}`)
    .join("\n\n");
  const text = `【参考资料】${doc.name}（第 ${normalizedRange || "全部"} 页）\n${body}`;
  return {
    text,
    tokens: estimateTokens(text),
    pageCount: indexes.length,
    normalizedRange: normalizedRange || "全部",
  };
}

/** 多份资料合并成一条 system 消息的内容 */
export function mergeDocContexts(blocks: DocContextBlock[]): {
  text: string;
  tokens: number;
} {
  if (blocks.length === 0) return { text: "", tokens: 0 };
  const text = blocks.map((b) => b.text).join("\n\n");
  return { text, tokens: estimateTokens(text) };
}

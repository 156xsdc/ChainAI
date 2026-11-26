/**
 * PDF 文本片段的纯整理逻辑（不依赖 pdfjs）
 * - 片段按 y 坐标聚成行、行内按 x 排序
 * - 中文之间不插空格，西文之间补空格
 * - base64 → Uint8Array
 */

export interface TextItemLike {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
}

const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

/** 合并同一行内的文字片段：中文之间不插空格，西文之间插一个空格 */
function joinItems(items: TextItemLike[]): string {
  let out = "";
  for (const it of items) {
    const str = it.str ?? "";
    if (!str) continue;
    if (out && it.hasEOL) out += "\n";
    else if (out) {
      const prev = out[out.length - 1];
      const next = str[0];
      // 中英文/标点交界处不空格，纯西文单词之间保留空格
      if (!CJK.test(prev) && !CJK.test(next) && !/\s$/.test(out)) out += " ";
    }
    out += str;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

/**
 * 把 pdf.js 的文本片段按位置整理成行（导出便于测试）
 * 同一行判定：y 坐标差 ≤ 2pt；行内按 x 升序
 */
export function itemsToPageText(items: TextItemLike[]): string {
  const valid = items.filter(
    (i) => typeof i?.str === "string" && (i.str as string).trim() !== ""
  );
  const lines: Array<{ y: number; items: TextItemLike[] }> = [];
  for (const item of valid) {
    const y = item.transform?.[5] ?? 0;
    const line = lines.find((l) => Math.abs(l.y - y) <= 2);
    if (line) line.items.push(item);
    else lines.push({ y, items: [item] });
  }
  // 页面坐标系 y 向下？pdf.js 的 transform[5] 越大越靠上，按降序即从上到下
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((line) => {
      const sorted = [...line.items].sort(
        (a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0)
      );
      return joinItems(sorted);
    })
    .filter(Boolean)
    .join("\n");
}

/** base64 → Uint8Array */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]+,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}


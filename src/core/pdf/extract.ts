/**
 * PDF 文字提取（只处理有文字层的 PDF；扫描件得到空文本由调用方提示）
 *
 * 用 pdf.js 在 webview 里跑：
 * - 不需要额外 Rust 依赖或原生库
 * - 能拿到"第几页的哪段文字"，天然支持按页选择
 * - worker 由 Vite 打包成独立资源（懒加载，不拖慢启动）
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { base64ToBytes, itemsToPageText, type TextItemLike } from "./textItems";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfExtractResult {
  pageCount: number;
  /** 每页提取的文字（已按行整理） */
  pages: string[];
  /** 纯文字字符数（去空白），用于判断是否为空文档 */
  charCount: number;
  /** 是否没有可用文字层（扫描件 / 纯图片） */
  empty: boolean;
}

/** 提取整份 PDF 的文字（按页） */
export async function extractPdfText(
  base64: string
): Promise<PdfExtractResult> {
  const data = base64ToBytes(base64);
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(itemsToPageText(content.items as TextItemLike[]));
      page.cleanup();
    }
  } finally {
    await doc.cleanup?.();
  }
  const charCount = pages.join("").replace(/\s/g, "").length;
  return {
    pageCount: pages.length,
    pages,
    charCount,
    empty: charCount < 20,
  };
}

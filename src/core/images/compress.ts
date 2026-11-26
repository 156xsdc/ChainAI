/**
 * 图片压缩（发送前）：缩到最长边 1568px、JPEG 0.85
 *
 * 为什么压：图片按分辨率计 token，原图几 MB 既慢又贵；
 * 1568px 是 Anthropic 推荐上限，再大也不会带来额外识别收益。
 *
 * 浏览器 API（createImageBitmap / canvas），仅在前端运行。
 */

export interface CompressedImage {
  /** base64（不含 data: 前缀） */
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  /** 小缩略图 data URL（消息/列表展示用，约 3~8KB） */
  thumb: string;
}

const MAX_EDGE = 1568;
const QUALITY = 0.85;
const THUMB_EDGE = 96;


function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]+,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 读取图片（优先 createImageBitmap，失败回落到 <img>） */
async function decode(
  bytes: Uint8Array,
  mimeType: string
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: mimeType || "image/png",
  });
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片解码失败"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toCanvas(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布（内存不足？）");
  // 白底：透明 PNG 转 JPEG 后不会变黑
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 压缩图片，返回 JPEG base64 + 尺寸 + 缩略图 */
export async function compressImage(
  base64: string,
  mimeType: string
): Promise<CompressedImage> {
  const bytes = base64ToBytes(base64);
  const { source, width, height } = await decode(bytes, mimeType);
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const canvas = toCanvas(source, outW, outH);
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  const compressed = dataUrl.replace(/^data:[^,]+,/, "");

  const thumbScale = Math.min(1, THUMB_EDGE / Math.max(outW, outH));
  const thumbCanvas = toCanvas(canvas, outW * thumbScale, outH * thumbScale);
  const thumb = thumbCanvas.toDataURL("image/jpeg", 0.7);

  return {
    base64: compressed,
    mimeType: "image/jpeg",
    width: outW,
    height: outH,
    thumb,
  };
}

/** 按扩展名猜 MIME（选择文件后没有可靠类型时用） */
export function guessImageMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}

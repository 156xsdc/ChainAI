/**
 * 多模态消息转换（纯函数，便于测试）
 *
 * 统一的内部表示：ChatMessage.content 仍是文本，图片放 messages[].images
 * 发请求前按各家协议转换：
 * - OpenAI 兼容：content 变成 [{type:"text"} , {type:"image_url"}]
 * - Anthropic：system 抽成独立字段，其余用 content blocks（image/base64）
 * - Ollama：暂不支持图片（适配器直接报错，避免静默丢图）
 */
import type { ChatImage, ChatMessage } from "./types";

/** 图片 token 粗略估算：约 宽×高/750（Anthropic 口径），OpenAI 数量级相近 */
export function estimateImageTokens(images: ChatImage[]): number {
  return images.reduce((sum, img) => {
    const w = img.width ?? 1024;
    const h = img.height ?? 1024;
    return sum + Math.ceil((w * h) / 750);
  }, 0);
}

/** 是否有任何消息带了图片 */
export function hasImages(messages: ChatMessage[]): boolean {
  return messages.some((m) => (m.images?.length ?? 0) > 0);
}

/** OpenAI 兼容协议的消息体 */
export function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (!m.images || m.images.length === 0) {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: [
        { type: "text", text: m.content },
        ...m.images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
      ],
    };
  });
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
}

/**
 * Anthropic 协议：system 单独字段 + user/assistant 的 content blocks。
 * 相邻同角色消息合并（Anthropic 要求交替）。
 */
export function toAnthropicPayload(messages: ChatMessage[]): {
  system: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const merged: Array<{
    role: "user" | "assistant";
    blocks: Array<Record<string, unknown>>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      if (m.content.trim()) systemParts.push(m.content);
      continue;
    }
    const blocks: Array<Record<string, unknown>> = [];
    if (m.content.trim()) blocks.push({ type: "text", text: m.content });
    for (const img of m.images ?? []) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.data,
        },
      });
    }
    if (blocks.length === 0) continue;

    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.blocks.push(...blocks);
    else merged.push({ role: m.role, blocks });
  }

  return {
    system: systemParts.join("\n\n"),
    messages: merged.map((m) => ({ role: m.role, content: m.blocks })),
  };
}

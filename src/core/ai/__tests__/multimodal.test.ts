import { describe, it, expect } from "vitest";
import {
  estimateImageTokens,
  hasImages,
  toAnthropicPayload,
  toOpenAiMessages,
} from "../multimodal";
import type { ChatMessage } from "../types";

const img = { mimeType: "image/jpeg", data: "QUJD", width: 1000, height: 1000 };

describe("hasImages", () => {
  it("识别带图消息", () => {
    expect(hasImages([{ role: "user", content: "hi" }])).toBe(false);
    expect(hasImages([{ role: "user", content: "看图", images: [img] }])).toBe(
      true
    );
  });
});

describe("toOpenAiMessages", () => {
  it("纯文本消息保持字符串 content", () => {
    const out = toOpenAiMessages([{ role: "user", content: "纯文本" }]) as Array<{
      role: string;
      content: unknown;
    }>;
    expect(out[0]).toEqual({ role: "user", content: "纯文本" });
  });

  it("带图消息转成 text + image_url 数组", () => {
    const out = toOpenAiMessages([
      { role: "user", content: "这是什么", images: [img] },
    ]) as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(out[0].content[0]).toEqual({ type: "text", text: "这是什么" });
    expect(out[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,QUJD" },
    });
  });

  it("多图按顺序追加", () => {
    const out = toOpenAiMessages([
      { role: "user", content: "两张", images: [img, { ...img, data: "REVG" }] },
    ]) as Array<{ content: Array<Record<string, unknown>> }>;
    expect(out[0].content).toHaveLength(3);
  });
});

describe("toAnthropicPayload", () => {
  it("system 抽成独立字段，其余转 content blocks", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "你是助手" },
      { role: "user", content: "问题" },
      { role: "assistant", content: "回答" },
    ];
    const { system, messages: out } = toAnthropicPayload(messages);
    expect(system).toBe("你是助手");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ role: "user", content: [{ type: "text", text: "问题" }] });
  });

  it("相邻同角色合并（Anthropic 要求交替）", () => {
    const { messages: out } = toAnthropicPayload([
      { role: "user", content: "第一段" },
      { role: "user", content: "第二段" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toHaveLength(2);
  });

  it("图片转 base64 image block", () => {
    const { messages: out } = toAnthropicPayload([
      { role: "user", content: "看图", images: [img] },
    ]);
    expect(out[0].content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "QUJD" },
    });
  });

  it("system 消息不进 messages（多个用空行拼接）", () => {
    const { system } = toAnthropicPayload([
      { role: "system", content: "A" },
      { role: "system", content: "B" },
      { role: "user", content: "q" },
    ]);
    expect(system).toBe("A\n\nB");
  });
});

describe("estimateImageTokens", () => {
  it("按面积估算（1000×1000 ≈ 1334）", () => {
    expect(estimateImageTokens([img])).toBe(Math.ceil(1000000 / 750));
  });

  it("缺尺寸按 1024×1024 估", () => {
    expect(
      estimateImageTokens([{ mimeType: "image/jpeg", data: "x" }])
    ).toBe(Math.ceil((1024 * 1024) / 750));
  });

  it("多图累加", () => {
    expect(estimateImageTokens([img, img])).toBe(
      2 * Math.ceil(1000000 / 750)
    );
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { AnthropicAdapter } from "../adapters/anthropic";
import {
  anthropicConfig,
  mockJSONResponse,
  mockStreamResponse,
} from "./helpers";

describe("AnthropicAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("提取system、合并连续角色、发送正确请求并解析流", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockStreamResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop"}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new AnthropicAdapter();
    const messages = [
      { role: "system" as const, content: "你是助手" },
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
      { role: "assistant" as const, content: "again" },
    ];
    const chunks: Array<{ delta?: string; done: boolean; usage?: unknown }> =
      [];
    for await (const c of adapter.chat({ messages }, anthropicConfig)) {
      chunks.push(c);
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init as RequestInit).headers).toMatchObject({
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
    });

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe("你是助手");
    expect(body.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello\n\nagain" },
    ]);
    expect(body.max_tokens).toBe(4096); // 默认值
    expect(body.stream).toBe(true);

    expect(chunks.map((c) => c.delta).filter(Boolean)).toEqual(["你好"]);
  });

  it("stop_reason=max_tokens 归一化为 length；thinking_delta 进 reasoning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockStreamResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"思考中"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":4096}}\n\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new AnthropicAdapter();
    let reasoning = "";
    let last: { delta?: string; finishReason?: string } = {};
    for await (const c of adapter.chat(
      { messages: [{ role: "user", content: "hi" }] },
      anthropicConfig
    )) {
      if (c.reasoning) reasoning += c.reasoning;
      if (c.done) last = c;
    }
    expect(reasoning).toBe("思考中");
    expect(last.delta).toBeUndefined();
    expect(last.finishReason).toBe("length");
  });

  it("缺少 API Key 时校验失败", () => {
    const adapter = new AnthropicAdapter();
    const err = adapter.validateConfig({ ...anthropicConfig, apiKey: "" });
    expect(err).toContain("API Key");
  });

  it("listModels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJSONResponse({
          data: [
            { id: "claude-sonnet-4", display_name: "Sonnet" },
            { id: "claude-opus-4" },
          ],
        })
      )
    );
    const adapter = new AnthropicAdapter();
    const res = await adapter.listModels(anthropicConfig);
    expect(res.models[0]).toEqual({ id: "claude-sonnet-4", name: "Sonnet" });
    expect(res.models[1]).toEqual({ id: "claude-opus-4", name: "claude-opus-4" });
  });
});

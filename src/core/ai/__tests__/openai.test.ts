import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIAdapter } from "../adapters/openai";
import { openAIConfig, mockJSONResponse, mockStreamResponse } from "./helpers";

describe("OpenAIAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("发送正确请求并解析流式输出", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockStreamResponse([
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenAIAdapter();
    const chunks: Array<{ delta?: string; done: boolean; usage?: unknown }> =
      [];
    for await (const c of adapter.chat(
      { messages: [{ role: "user", content: "hi" }] },
      openAIConfig
    )) {
      chunks.push(c);
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: "gpt-4o-mini",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(chunks.map((c) => c.delta).filter(Boolean)).toEqual(["你好", "世界"]);
    expect(chunks[chunks.length - 1]).toMatchObject({
      done: true,
      usage: { totalTokens: 15 },
    });
  });

  it("提取推理内容（DeepSeek-R1 格式）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockStreamResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"答案"}}]}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenAIAdapter();
    const chunks: Array<{ delta?: string; reasoning?: string }> = [];
    for await (const c of adapter.chat(
      { messages: [{ role: "user", content: "hi" }] },
      openAIConfig
    )) {
      chunks.push(c);
    }
    expect(chunks[0].reasoning).toBe("思考中");
    expect(chunks[1].delta).toBe("答案");
  });

  it("识别 finish_reason=length（思考吃光额度、正文为空）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockStreamResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"想了很久"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenAIAdapter();
    let reasoning = "";
    let last: { delta?: string; finishReason?: string } = {};
    for await (const c of adapter.chat(
      { messages: [{ role: "user", content: "hi" }] },
      openAIConfig
    )) {
      if (c.reasoning) reasoning += c.reasoning;
      if (c.done) last = c;
    }
    expect(reasoning).toBe("想了很久");
    expect(last.delta).toBeUndefined();
    expect(last.finishReason).toBe("length");
  });

  it("401 归一化为 auth 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }))
    );
    const adapter = new OpenAIAdapter();
    await expect(
      (async () => {
        for await (const _c of adapter.chat(
          { messages: [{ role: "user", content: "hi" }] },
          openAIConfig
        )) {
          // consume
        }
      })()
    ).rejects.toMatchObject({ code: "auth" });
  });

  it("max_tokens 字段根据配置切换", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OpenAIAdapter();
    const cfg = {
      ...openAIConfig,
      useMaxCompletionTokens: true,
      maxTokens: 100,
    };
    for await (const _c of adapter.chat({ messages: [] }, cfg)) {
      // consume
    }
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.max_completion_tokens).toBe(100);
    expect(body.max_tokens).toBeUndefined();
  });

  it("listModels 返回模型列表", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJSONResponse({
          data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
        })
      )
    );
    const adapter = new OpenAIAdapter();
    const res = await adapter.listModels(openAIConfig);
    expect(res.models.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });
});

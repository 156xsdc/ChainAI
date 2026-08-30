import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaAdapter } from "../adapters/ollama";
import { mockJSONResponse, mockStreamResponse, ollamaConfig } from "./helpers";

describe("OllamaAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("NDJSON 流解析 + 无认证 + options 映射", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockStreamResponse([
        '{"message":{"role":"assistant","content":"你"},"done":false}\n',
        '{"message":{"role":"assistant","content":"好"},"done":false}\n',
        '{"message":{"role":"assistant","content":""},"done":true,"eval_count":10,"prompt_eval_count":5}\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OllamaAdapter();
    const cfg = { ...ollamaConfig, maxTokens: 256, temperature: 0.7 };
    const chunks: Array<{ delta?: string; done: boolean; usage?: unknown }> =
      [];
    for await (const c of adapter.chat(
      { messages: [{ role: "user", content: "hi" }] },
      cfg
    )) {
      chunks.push(c);
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.options).toEqual({
      temperature: 0.7,
      num_predict: 256,
    });

    expect(chunks.map((c) => c.delta).filter(Boolean)).toEqual(["你", "好"]);
    expect(chunks[chunks.length - 1].usage).toMatchObject({
      totalTokens: 15,
    });
  });

  it("listModels 解析 /api/tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJSONResponse({
          models: [
            { name: "qwen2.5:7b" },
            { name: "llama3.1:8b" },
          ],
        })
      )
    );
    const adapter = new OllamaAdapter();
    const res = await adapter.listModels(ollamaConfig);
    expect(res.models.map((m) => m.id)).toEqual(["qwen2.5:7b", "llama3.1:8b"]);
  });
});

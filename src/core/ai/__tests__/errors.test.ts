import { describe, it, expect } from "vitest";
import { ChatError } from "../errors";

describe("ChatError", () => {
  it("识别上下文超限错误并给出可操作建议（Ollama）", () => {
    const body =
      '{"error":"request(5698tokens) exceeds the available context size (4096 tokens), try increasing it"}';
    const err = ChatError.fromStatus(400, body, "ollama");
    expect(err.code).toBe("context_exceeded");
    expect(err.message).toContain("5698");
    expect(err.message).toContain("新分支");
    expect(err.message).toContain("num_ctx");
  });

  it("识别 OpenAI 兼容的上下文超限", () => {
    const body =
      '{"error":{"message":"This model\'s maximum context length is 8192 tokens. You requested 9000 tokens."}}';
    const err = ChatError.fromStatus(400, body, "openai");
    expect(err.code).toBe("context_exceeded");
  });

  it("普通 400 错误保持原样", () => {
    const err = ChatError.fromStatus(400, "invalid request body", "openai");
    expect(err.code).toBe("bad_request");
    expect(err.message).toContain("请求错误（400）");
  });

  it("429 限流 / 401 认证不受影响", () => {
    expect(ChatError.fromStatus(429).code).toBe("rate_limit");
    expect(ChatError.fromStatus(401).code).toBe("auth");
  });
});

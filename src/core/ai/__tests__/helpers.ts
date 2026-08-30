/** 测试辅助：mock fetch 响应 */
import type { ProviderConfig } from "../types";

export function mockStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

export function mockJSONResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const openAIConfig: ProviderConfig = {
  id: "c-openai",
  providerId: "openai",
  name: "测试OpenAI",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
};

export const anthropicConfig: ProviderConfig = {
  id: "c-anthropic",
  providerId: "anthropic",
  name: "测试Claude",
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-ant-test",
  model: "claude-sonnet-4",
};

export const ollamaConfig: ProviderConfig = {
  id: "c-ollama",
  providerId: "ollama",
  name: "本地Ollama",
  baseUrl: "http://localhost:11434",
  model: "qwen2.5",
};

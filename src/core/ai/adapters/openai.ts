/**
 * OpenAI 适配器
 * 同时兼容所有 OpenAI 格式服务：DeepSeek、Moonshot/Kimi、智谱GLM、OpenRouter、Groq 等
 * （仅需修改 baseUrl + model）
 */
import { parseJSONSafe, createSSEParser } from "../sse";
import { toOpenAiMessages } from "../multimodal";
import type {
  ChatRequest,
  ChatStreamChunk,
  ModelListResult,
  ProviderConfig,
  TokenUsage,
} from "../types";
import { BaseAdapter, trimSlash } from "./base";

interface OpenAIDelta {
  content?: string;
  reasoning_content?: string; // DeepSeek-R1 等
  reasoning?: string; // OpenAI o 系列
}

interface OpenAISSEPayload {
  choices?: Array<{
    delta?: OpenAIDelta;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenAIAdapter extends BaseAdapter {
  readonly providerId = "openai" as const;
  readonly displayName = "OpenAI 兼容";
  readonly defaultBaseUrl = "https://api.openai.com/v1";

  validateConfig(config: ProviderConfig): string | null {
    const base = super.validateConfig(config);
    if (base) return base;
    // apiKey 可选：本地兼容服务（如 one-api 中转）可能不需要
    return null;
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    return headers;
  }

  async *chat(
    request: ChatRequest,
    config: ProviderConfig
  ): AsyncIterable<ChatStreamChunk> {
    const body: Record<string, unknown> = {
      model: request.model ?? config.model,
      messages: toOpenAiMessages(request.messages),
      stream: true,
    };

    const temperature = request.temperature ?? config.temperature;
    if (temperature !== undefined) body.temperature = temperature;

    const maxTokens = request.maxTokens ?? config.maxTokens;
    if (maxTokens !== undefined) {
      // 新模型（gpt-5 / o 系列）用 max_completion_tokens，老模型用 max_tokens
      body[config.useMaxCompletionTokens ? "max_completion_tokens" : "max_tokens"] =
        maxTokens;
    }

    const url = `${trimSlash(config.baseUrl)}/chat/completions`;
    const init: RequestInit = {
      method: "POST",
      headers: this.buildHeaders(config),
      body: JSON.stringify(body),
      signal: request.signal,
    };

    const queue: ChatStreamChunk[] = [];
    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;

    const parser = createSSEParser((ev) => {
      if (ev.data === "[DONE]") return;
      const json = parseJSONSafe<OpenAISSEPayload>(ev.data);
      if (!json) return;

      const choice = json.choices?.[0];
      const delta = choice?.delta;
      const chunk: ChatStreamChunk = { done: false };
      if (delta?.content) chunk.delta = delta.content;
      if (delta?.reasoning_content) chunk.reasoning = delta.reasoning_content;
      else if (delta?.reasoning) chunk.reasoning = delta.reasoning;

      // finish_reason: "stop" | "length" | "content_filter" ...
      if (choice?.finish_reason) finishReason = choice.finish_reason;

      if (json.usage) {
        usage = {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        };
      }
      if (chunk.delta !== undefined || chunk.reasoning !== undefined) {
        queue.push(chunk);
      }
    });

    for await (const text of this.readStream(url, init)) {
      parser.push(text);
      while (queue.length > 0) yield queue.shift()!;
    }
    parser.flush();
    while (queue.length > 0) yield queue.shift()!;

    yield { done: true, usage, finishReason };
  }

  async listModels(config: ProviderConfig): Promise<ModelListResult> {
    const url = `${trimSlash(config.baseUrl)}/models`;
    const data = await this.fetchJSON<{
      data: Array<{ id: string; owned_by?: string }>;
    }>(url, { method: "GET", headers: this.buildHeaders(config) });
    return {
      models: data.data.map((m) => ({ id: m.id, name: m.id })),
    };
  }
}

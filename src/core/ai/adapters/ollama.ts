/**
 * Ollama 本地模型适配器
 * 差异点：无认证、NDJSON 流、/api/chat 端点
 */
import { createLineParser, parseJSONSafe } from "../sse";
import type {
  ChatRequest,
  ChatStreamChunk,
  ModelListResult,
  ProviderConfig,
  TokenUsage,
} from "../types";
import { BaseAdapter, trimSlash } from "./base";

interface OllamaLine {
  message?: { role?: string; content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaAdapter extends BaseAdapter {
  readonly providerId = "ollama" as const;
  readonly displayName = "Ollama 本地";
  readonly defaultBaseUrl = "http://localhost:11434";

  validateConfig(config: ProviderConfig): string | null {
    const base = super.validateConfig(config);
    if (base) return base;
    return null; // 无认证
  }

  async *chat(
    request: ChatRequest,
    config: ProviderConfig
  ): AsyncIterable<ChatStreamChunk> {
    const body: Record<string, unknown> = {
      model: request.model ?? config.model,
      messages: request.messages,
      stream: true,
    };

    const options: Record<string, unknown> = {};
    const temperature = request.temperature ?? config.temperature;
    if (temperature !== undefined) options.temperature = temperature;
    const maxTokens = request.maxTokens ?? config.maxTokens;
    if (maxTokens !== undefined) options.num_predict = maxTokens;
    if (Object.keys(options).length > 0) body.options = options;

    const url = `${trimSlash(config.baseUrl)}/api/chat`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    };

    const queue: ChatStreamChunk[] = [];
    let usage: TokenUsage | undefined;

    const parser = createLineParser((line) => {
      const json = parseJSONSafe<OllamaLine>(line);
      if (!json) return;

      if (json.message?.content) {
        queue.push({ delta: json.message.content, done: false });
      }
      if (json.done) {
        usage = {
          promptTokens: json.prompt_eval_count,
          completionTokens: json.eval_count,
          totalTokens:
            (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
        };
      }
    });

    for await (const text of this.readStream(url, init)) {
      parser.push(text);
      while (queue.length > 0) yield queue.shift()!;
    }
    parser.flush();
    while (queue.length > 0) yield queue.shift()!;

    yield { done: true, usage };
  }

  async listModels(config: ProviderConfig): Promise<ModelListResult> {
    const url = `${trimSlash(config.baseUrl)}/api/tags`;
    const data = await this.fetchJSON<{
      models?: Array<{ name: string; model?: string; details?: unknown }>;
    }>(url, { method: "GET" });
    return {
      models: (data.models ?? []).map((m) => ({
        id: m.name,
        name: m.name,
      })),
    };
  }
}

/**
 * Anthropic Claude 适配器
 * 差异点：system 单独字段、x-api-key 认证、消息必须 user/assistant 交替、max_tokens 必填
 */
import { createSSEParser, parseJSONSafe } from "../sse";
import { toAnthropicPayload } from "../multimodal";
import type {
  ChatRequest,
  ChatStreamChunk,
  ModelListResult,
  ProviderConfig,
  TokenUsage,
} from "../types";
import { BaseAdapter, trimSlash } from "./base";

interface AnthropicSSEPayload {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    stop_reason?: string | null;
  };
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicAdapter extends BaseAdapter {
  readonly providerId = "anthropic" as const;
  readonly displayName = "Anthropic Claude";
  readonly defaultBaseUrl = "https://api.anthropic.com";

  validateConfig(config: ProviderConfig): string | null {
    const base = super.validateConfig(config);
    if (base) return base;
    if (!config.apiKey) return "缺少 API Key";
    return null;
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (config.apiKey) headers["x-api-key"] = config.apiKey;
    return headers;
  }

  async *chat(
    request: ChatRequest,
    config: ProviderConfig
  ): AsyncIterable<ChatStreamChunk> {
    const { system, messages } = toAnthropicPayload(request.messages);

    const body: Record<string, unknown> = {
      model: request.model ?? config.model,
      messages,
      stream: true,
      // Anthropic 必填
      max_tokens: request.maxTokens ?? config.maxTokens ?? 4096,
    };
    if (system) body.system = system;

    const temperature = request.temperature ?? config.temperature;
    if (temperature !== undefined) body.temperature = temperature;

    const url = `${trimSlash(config.baseUrl)}/v1/messages`;
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
      const json = parseJSONSafe<AnthropicSSEPayload>(ev.data);
      if (!json) return;

      if (json.type === "content_block_delta" && json.delta) {
        if (json.delta.type === "text_delta" && json.delta.text) {
          queue.push({ delta: json.delta.text, done: false });
        } else if (json.delta.type === "thinking_delta" && json.delta.thinking) {
          queue.push({ reasoning: json.delta.thinking, done: false });
        }
      } else if (json.type === "message_delta") {
        // stop_reason: end_turn / max_tokens / stop_sequence / tool_use
        // 归一化 max_tokens → length（与 OpenAI 系保持一致的判断口径）
        if (json.delta?.stop_reason) {
          finishReason =
            json.delta.stop_reason === "max_tokens"
              ? "length"
              : json.delta.stop_reason;
        }
        if (json.usage) {
          usage = {
            promptTokens: json.usage.input_tokens,
            completionTokens: json.usage.output_tokens,
            totalTokens:
              (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
          };
        }
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
    const url = `${trimSlash(config.baseUrl)}/v1/models`;
    const data = await this.fetchJSON<{
      data: Array<{ id: string; display_name?: string }>;
    }>(url, { method: "GET", headers: this.buildHeaders(config) });
    return {
      models: data.data.map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
      })),
    };
  }
}

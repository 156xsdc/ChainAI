/**
 * Anthropic Claude 适配器
 * 差异点：system 单独字段、x-api-key 认证、消息必须 user/assistant 交替、max_tokens 必填
 */
import { createSSEParser, parseJSONSafe } from "../sse";
import type {
  ChatMessage,
  ChatRequest,
  ChatStreamChunk,
  ModelListResult,
  ProviderConfig,
  TokenUsage,
} from "../types";
import { BaseAdapter, trimSlash } from "./base";

interface AnthropicSSEPayload {
  type?: string;
  delta?: { type?: string; text?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** 提取 system 消息（多个用换行拼接），并从消息列表中移除 */
function extractSystem(messages: ChatMessage[]): {
  system: string;
  rest: ChatMessage[];
} {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else rest.push(m);
  }
  return { system: systemParts.join("\n\n"), rest };
}

/** Anthropic 要求 user/assistant 交替，合并连续相同角色 */
function mergeAdjacentRoles(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const m of messages) {
    const last = result[result.length - 1];
    if (last && last.role === m.role) {
      last.content += "\n\n" + m.content;
    } else {
      result.push({ role: m.role, content: m.content });
    }
  }
  return result;
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
    const { system, rest } = extractSystem(request.messages);
    const messages = mergeAdjacentRoles(rest);

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

    const parser = createSSEParser((ev) => {
      const json = parseJSONSafe<AnthropicSSEPayload>(ev.data);
      if (!json) return;

      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        if (json.delta.text) queue.push({ delta: json.delta.text, done: false });
      } else if (json.type === "message_delta" && json.usage) {
        usage = {
          promptTokens: json.usage.input_tokens,
          completionTokens: json.usage.output_tokens,
          totalTokens:
            (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
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

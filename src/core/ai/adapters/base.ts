/**
 * 适配器抽象基类
 * 提供统一的流式请求、错误归一化、配置校验。
 */
import { ChatError } from "../errors";
import type {
  ChatRequest,
  ChatStreamChunk,
  ModelListResult,
  ProviderConfig,
  ProviderId,
} from "../types";

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly defaultBaseUrl: string;
  /** 统一的流式聊天调用 */
  chat(
    request: ChatRequest,
    config: ProviderConfig
  ): AsyncIterable<ChatStreamChunk>;
  /** 列出可用模型（不支持则返回空列表） */
  listModels(config: ProviderConfig): Promise<ModelListResult>;
  /** 校验配置，返回错误信息或 null */
  validateConfig(config: ProviderConfig): string | null;
}

export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly providerId: ProviderId;
  abstract readonly displayName: string;
  abstract readonly defaultBaseUrl: string;

  abstract chat(
    request: ChatRequest,
    config: ProviderConfig
  ): AsyncIterable<ChatStreamChunk>;

  async listModels(_config: ProviderConfig): Promise<ModelListResult> {
    return { models: [] };
  }

  validateConfig(config: ProviderConfig): string | null {
    if (!config.baseUrl.trim()) return "缺少 API 地址（baseUrl）";
    if (!config.model.trim()) return "缺少模型名称";
    return null;
  }

  /** 非流式 JSON 请求，自动归一化错误 */
  protected async fetchJSON<T>(
    url: string,
    init: RequestInit
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw ChatError.fromError(err, this.providerId);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw ChatError.fromStatus(res.status, body, this.providerId);
    }
    return (await res.json()) as T;
  }

  /** 流式请求：yield 原始文本块，统一处理错误与中断 */
  protected async *readStream(
    url: string,
    init: RequestInit
  ): AsyncIterable<string> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw ChatError.fromError(err, this.providerId);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw ChatError.fromStatus(res.status, body, this.providerId);
    }
    if (!res.body) {
      throw new ChatError("network", "响应无数据流", {
        providerId: this.providerId,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
      const tail = decoder.decode();
      if (tail) yield tail;
    } catch (err) {
      throw ChatError.fromError(err, this.providerId);
    } finally {
      reader.releaseLock();
    }
  }
}

/** 去掉 baseUrl 末尾的斜杠 */
export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

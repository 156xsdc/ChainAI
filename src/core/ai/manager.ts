/**
 * ProviderManager：多提供商/多配置的统一管理入口
 *
 * 职责：
 * - 管理多个提供商适配器（openai / anthropic / ollama）
 * - 管理用户保存的多套配置，支持默认配置切换
 * - 提供统一的 chat / listModels / testConnection 入口
 * - 配置持久化由上层（SQLite）负责，本类只做内存管理
 */
import { AnthropicAdapter } from "./adapters/anthropic";
import { OllamaAdapter } from "./adapters/ollama";
import { OpenAIAdapter } from "./adapters/openai";
import type { ProviderAdapter } from "./adapters/base";
import { ChatError } from "./errors";
import type {
  ChatRequest,
  ChatStreamChunk,
  ModelListResult,
  ProviderConfig,
  ProviderId,
} from "./types";

export class ProviderManager {
  private adapters = new Map<ProviderId, ProviderAdapter>();
  private configs: ProviderConfig[] = [];

  constructor() {
    // 注册内置适配器
    this.registerAdapter(new OpenAIAdapter());
    this.registerAdapter(new AnthropicAdapter());
    this.registerAdapter(new OllamaAdapter());
  }

  /** 注册/覆盖适配器（支持扩展新提供商） */
  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  getAdapter(providerId: ProviderId): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getSupportedProviders(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  /** 载入配置列表（来自持久化层），并保证有且仅有一个默认 */
  setConfigs(configs: ProviderConfig[]): void {
    this.configs = [...configs];
    const defaults = this.configs.filter((c) => c.isDefault);
    if (defaults.length === 0 && this.configs.length > 0) {
      this.configs[0].isDefault = true;
    } else if (defaults.length > 1) {
      defaults.forEach((c, i) => {
        if (i > 0) c.isDefault = false;
      });
    }
  }

  getConfigs(): ProviderConfig[] {
    return this.configs;
  }

  getActiveConfig(): ProviderConfig | undefined {
    return this.configs.find((c) => c.isDefault) ?? this.configs[0];
  }

  getConfigById(id: string): ProviderConfig | undefined {
    return this.configs.find((c) => c.id === id);
  }

  /** 切换默认配置 */
  setDefault(configId: string): void {
    for (const c of this.configs) {
      c.isDefault = c.id === configId;
    }
  }

  /** 新增或更新配置 */
  upsertConfig(config: ProviderConfig): void {
    const idx = this.configs.findIndex((c) => c.id === config.id);
    if (idx >= 0) this.configs[idx] = config;
    else this.configs.push(config);
    // 保持默认唯一
    this.setConfigs(this.configs);
  }

  removeConfig(configId: string): void {
    this.configs = this.configs.filter((c) => c.id !== configId);
    this.setConfigs(this.configs);
  }

  /** 校验配置 */
  validateConfig(config: ProviderConfig): string | null {
    const adapter = this.adapters.get(config.providerId);
    if (!adapter) return `不支持的提供商：${config.providerId}`;
    return adapter.validateConfig(config);
  }

  /** 统一聊天入口（流式） */
  async *chat(
    request: ChatRequest,
    config?: ProviderConfig
  ): AsyncIterable<ChatStreamChunk> {
    const active = config ?? this.getActiveConfig();
    if (!active) {
      throw new ChatError("bad_request", "尚未配置任何 AI 服务，请先在设置中添加");
    }
    const adapter = this.adapters.get(active.providerId);
    if (!adapter) {
      throw new ChatError("bad_request", `不支持的提供商：${active.providerId}`);
    }
    const err = adapter.validateConfig(active);
    if (err) throw new ChatError("bad_request", err, { providerId: active.providerId });

    yield* adapter.chat(request, active);
  }

  /** 列出模型 */
  async listModels(config: ProviderConfig): Promise<ModelListResult> {
    const adapter = this.adapters.get(config.providerId);
    if (!adapter) return { models: [] };
    return adapter.listModels(config);
  }

  /** 测试连接：发送一条极简消息验证配置 */
  async testConnection(config: ProviderConfig): Promise<{
    ok: boolean;
    message: string;
    models?: string[];
  }> {
    const err = this.validateConfig(config);
    if (err) return { ok: false, message: err };

    try {
      const { models } = await this.listModels(config);
      const modelList = models.map((m) => m.id).slice(0, 20);
      return {
        ok: true,
        message: `连接成功，共 ${models.length} 个模型${modelList.length ? `：${modelList.join(", ")}` : ""}`,
        models: modelList,
      };
    } catch (e) {
      const ce = e instanceof ChatError ? e : ChatError.fromError(e, config.providerId);
      return { ok: false, message: ce.message };
    }
  }
}

/** 全局单例 */
export const providerManager = new ProviderManager();

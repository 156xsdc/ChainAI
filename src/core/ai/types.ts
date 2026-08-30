/**
 * AI 适配层统一类型定义
 * 所有提供商（OpenAI / Anthropic / Ollama / 兼容服务）共用同一套类型。
 */

export type ProviderId = "openai" | "anthropic" | "ollama";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** 提供商配置（用户可保存多个，一键切换） */
export interface ProviderConfig {
  id: string; // 配置唯一ID（uuid）
  providerId: ProviderId;
  name: string; // 用户自定义名称，如 "我的DeepSeek"
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** OpenAI系专用：新模型用 max_completion_tokens，老模型用 max_tokens */
  useMaxCompletionTokens?: boolean;
  isDefault?: boolean;
  enabled?: boolean;
  createdAt?: number;
}

/** 统一的聊天请求 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string; // 覆盖配置中的模型
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** 统一的流式输出块 */
export interface ChatStreamChunk {
  /** 增量文本 */
  delta?: string;
  /** 推理内容（o1 / DeepSeek-R1 等） */
  reasoning?: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** 模型信息（模型列表接口） */
export interface ModelInfo {
  id: string;
  name?: string;
  contextLength?: number;
}

/** 统一的模型列表 */
export interface ModelListResult {
  models: ModelInfo[];
}

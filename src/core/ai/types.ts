/**
 * AI 适配层统一类型定义
 * 所有提供商（OpenAI / Anthropic / Ollama / 兼容服务）共用同一套类型。
 */

export type ProviderId = "openai" | "anthropic" | "ollama";

export type ChatRole = "system" | "user" | "assistant";

/** 随消息发送的图片（base64，不含 data: 前缀） */
export interface ChatImage {
  /** 如 image/jpeg */
  mimeType: string;
  /** base64 编码的图片数据 */
  data: string;
  /** 原始尺寸（用于 token 估算，可选） */
  width?: number;
  height?: number;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /**
   * 多模态：随该消息一起发送的图片（仅 user 消息有效）
   * 适配器负责转换成各家协议格式；不支持图片的提供商会直接报错
   */
  images?: ChatImage[];
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
  /** 该配置的模型是否支持读图（视觉模型）。关掉时附带图片会被拦截 */
  supportsVision?: boolean;
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
  /**
   * 结束原因（随最后一个 chunk 返回）。
   * "length" = 输出被长度上限截断（思考型模型常见：思考过程吃掉了全部 max_tokens，
   * 正文为空），据此给用户明确提示，而不是静默"没有回复"。
   */
  finishReason?: string;
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

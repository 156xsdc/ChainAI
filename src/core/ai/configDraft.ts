/**
 * AI 配置编辑草稿：纯函数（无 UI / React 依赖，便于单测回归）
 *
 * 背景：「设置 → 新增/编辑 AI 配置」表单曾出现"输入内容被重置"的问题：
 * - 切换提供商时用一份全新的默认配置整体替换草稿，用户已填的 Key / 模型 / 地址被清空
 * - 数字框 `Number("")` 归零，清空重输会跳成 0
 * 这里把"切换时该保留什么、保存前该怎么归一化"抽成纯函数，行为可测试。
 */
import type { ProviderConfig, ProviderId } from "./types";

export interface ProviderMeta {
  label: string;
  defaultBaseUrl: string;
  /** API Key 是否必填（本地服务可留空） */
  needKey: boolean;
}

/** 提供商元信息（表单下拉选项 / 默认地址 / Key 是否必填） */
export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  openai: {
    label: "OpenAI 兼容",
    defaultBaseUrl: "https://api.openai.com/v1",
    needKey: false,
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    needKey: true,
  },
  ollama: {
    label: "Ollama 本地",
    defaultBaseUrl: "http://localhost:11434",
    needKey: false,
  },
};

/** 该提供商自动生成的配置名 */
export function defaultNameFor(providerId: ProviderId): string {
  return providerId === "openai" ? "默认" : PROVIDER_META[providerId].label;
}

/** URL 归一化：去空白与末尾斜杠（仅用于比较 / 保存前清理） */
function normUrl(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

/** 地址是否仍是该提供商的默认值（= 用户没自定义过） */
export function isDefaultBaseUrl(config: ProviderConfig): boolean {
  const cur = normUrl(config.baseUrl);
  const def = normUrl(PROVIDER_META[config.providerId]?.defaultBaseUrl);
  return cur === "" || cur === def;
}

/** 名称是否仍是自动生成的默认名（= 用户没自定义过） */
export function isDefaultName(config: ProviderConfig): boolean {
  const name = config.name.trim();
  return name === "" || name === defaultNameFor(config.providerId);
}

/** 新建一份空白配置（id 为随机值，保存时才会入库） */
export function blankConfig(providerId: ProviderId): ProviderConfig {
  const meta = PROVIDER_META[providerId];
  return {
    id: crypto.randomUUID(),
    providerId,
    name: defaultNameFor(providerId),
    baseUrl: meta.defaultBaseUrl,
    apiKey: "",
    model: "",
    temperature: 0.7,
    maxTokens: 2048,
    useMaxCompletionTokens: false,
  };
}

/**
 * 草稿副本：与 providerManager 内部对象完全隔离。
 * （管理器会就地修改某项的 isDefault，共享引用会让编辑中的草稿被"隔空"改动）
 */
export function cloneConfig(config: ProviderConfig): ProviderConfig {
  // 字段均为原始类型，浅拷贝即等价于深拷贝
  return { ...config };
}

/**
 * 切换提供商：**保留用户已填写的内容**。
 * - API Key / 模型 / 温度 / 最大 Token / 其它字段：原样保留
 * - 名称：用户改过则保留；仍是默认名则跟随新提供商
 * - API 地址：用户自定义过则保留；否则换成新提供商的默认地址
 * - id / isDefault：保持不变
 */
export function switchProviderConfig(
  config: ProviderConfig,
  providerId: ProviderId
): ProviderConfig {
  if (providerId === config.providerId) return config;
  const keepName = !isDefaultName(config);
  const keepUrl = !isDefaultBaseUrl(config);
  return {
    ...config,
    providerId,
    name: keepName ? config.name : defaultNameFor(providerId),
    baseUrl: keepUrl ? config.baseUrl : PROVIDER_META[providerId].defaultBaseUrl,
  };
}

/**
 * 解析可选数字输入：空串 / 非法 / 输入中间态（如 "1."）→ fallback（默认 undefined）。
 * 避免 `Number("") === 0`、`Number("abc") === NaN` 把用户输入"重置"成 0。
 */
export function parseOptionalNumber(
  text: string,
  fallback: number | undefined = undefined
): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/** 表单里的原始值（数字/开关为 DOM 原始状态，未渲染的字段为 undefined） */
export interface FormValues {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** 数字框原始文本 */
  temperature?: string;
  maxTokens?: string;
  useMaxCompletionTokens?: boolean;
}

/**
 * 把"界面上实际看到的值"合并进配置。
 * 以表单为准，是为了兜住"输入没触发 onChange（粘贴/自动填充/输入法）"的情况：
 * 否则这些文字只存在于 DOM，一旦重渲染就会被旧状态覆盖（填好的内容被重置）。
 * 数字框留空视为"沿用原值"，不会跳成 0。
 */
export function mergeFormValues(
  base: ProviderConfig,
  form: FormValues
): ProviderConfig {
  const out: ProviderConfig = { ...base };
  if (form.name !== undefined) out.name = form.name;
  if (form.baseUrl !== undefined) out.baseUrl = form.baseUrl;
  if (form.apiKey !== undefined) out.apiKey = form.apiKey;
  if (form.model !== undefined) out.model = form.model;
  if (form.temperature !== undefined) {
    out.temperature = parseOptionalNumber(form.temperature, base.temperature);
  }
  if (form.maxTokens !== undefined) {
    out.maxTokens = parseOptionalNumber(form.maxTokens, base.maxTokens);
  }
  if (form.useMaxCompletionTokens !== undefined) {
    out.useMaxCompletionTokens = form.useMaxCompletionTokens;
  }
  return out;
}

/** 保存前归一化：去空白、修正越界数字（不改变用户语义） */
export function normalizeConfig(config: ProviderConfig): ProviderConfig {
  const out: ProviderConfig = {
    ...config,
    name: config.name.trim() || defaultNameFor(config.providerId),
    baseUrl: normUrl(config.baseUrl),
    model: config.model.trim(),
  };
  if (out.temperature !== undefined) {
    out.temperature = Math.min(2, Math.max(0, out.temperature));
  }
  if (out.maxTokens !== undefined) {
    out.maxTokens = Math.max(1, Math.round(out.maxTokens));
  }
  // 本地服务（Ollama / one-api 中转）常留空 Key：空串归一为 undefined
  if (!out.apiKey || !out.apiKey.trim()) delete out.apiKey;
  return out;
}

/**
 * AI 配置编辑草稿回归测试
 * 覆盖「编辑中的输入内容被重置」的根因：切换提供商清空字段、数字解析归零
 */
import { describe, expect, it } from "vitest";
import {
  blankConfig,
  cloneConfig,
  isDefaultBaseUrl,
  isDefaultName,
  mergeFormValues,
  normalizeConfig,
  parseOptionalNumber,
  PROVIDER_META,
  switchProviderConfig,
} from "../configDraft";
import type { ProviderConfig } from "../types";

/** 用户已填写完的 Anthropic 配置（模拟草稿） */
const filled: ProviderConfig = {
  id: "c-1",
  providerId: "anthropic",
  name: "我的Claude",
  baseUrl: "https://proxy.example.com/anthropic",
  apiKey: "sk-ant-xxx",
  model: "claude-sonnet-4",
  temperature: 1.2,
  maxTokens: 8192,
  isDefault: true,
};

describe("blankConfig", () => {
  it("按提供商给出默认地址与名称", () => {
    const openai = blankConfig("openai");
    expect(openai.providerId).toBe("openai");
    expect(openai.name).toBe("默认");
    expect(openai.baseUrl).toBe(PROVIDER_META.openai.defaultBaseUrl);
    expect(openai.model).toBe("");
    expect(openai.temperature).toBe(0.7);
    expect(openai.maxTokens).toBe(2048);

    expect(blankConfig("ollama").name).toBe("Ollama 本地");
    expect(blankConfig("ollama").baseUrl).toBe("http://localhost:11434");
  });

  it("每次生成独立 id（重复新增不会互相覆盖）", () => {
    expect(blankConfig("openai").id).not.toBe(blankConfig("openai").id);
  });
});

describe("cloneConfig", () => {
  it("返回独立副本：改动副本不影响原对象", () => {
    const copy = cloneConfig(filled);
    copy.name = "改了";
    copy.baseUrl = "http://x";
    copy.apiKey = undefined;
    expect(filled.name).toBe("我的Claude");
    expect(filled.baseUrl).toBe("https://proxy.example.com/anthropic");
    expect(filled.apiKey).toBe("sk-ant-xxx");
  });
});

describe("switchProviderConfig（切换提供商不重置表单）", () => {
  it("保留用户已填写的 Key / 模型 / 温度 / Token", () => {
    const next = switchProviderConfig(filled, "openai");
    expect(next.providerId).toBe("openai");
    expect(next.apiKey).toBe("sk-ant-xxx");
    expect(next.model).toBe("claude-sonnet-4");
    expect(next.temperature).toBe(1.2);
    expect(next.maxTokens).toBe(8192);
    expect(next.id).toBe("c-1");
    expect(next.isDefault).toBe(true);
  });

  it("自定义过的地址与名称原样保留", () => {
    const next = switchProviderConfig(filled, "ollama");
    expect(next.baseUrl).toBe("https://proxy.example.com/anthropic");
    expect(next.name).toBe("我的Claude");
  });

  it("未自定义的地址换成新提供商默认地址，默认名跟随提供商", () => {
    const fresh = blankConfig("openai");
    const next = switchProviderConfig(fresh, "ollama");
    expect(next.baseUrl).toBe(PROVIDER_META.ollama.defaultBaseUrl);
    expect(next.name).toBe("Ollama 本地");
  });

  it("同提供商切换为无操作（保持对象身份不变）", () => {
    expect(switchProviderConfig(filled, "anthropic")).toBe(filled);
  });
});

describe("isDefaultBaseUrl / isDefaultName", () => {
  it("识别默认值与自定义值（忽略空白与末尾斜杠）", () => {
    expect(isDefaultBaseUrl({ ...filled, baseUrl: "https://api.anthropic.com/" })).toBe(true);
    expect(isDefaultBaseUrl({ ...filled, baseUrl: "  " })).toBe(true);
    expect(isDefaultBaseUrl(filled)).toBe(false);
    expect(isDefaultName({ ...filled, name: "Anthropic Claude" })).toBe(true);
    expect(isDefaultName({ ...filled, name: "  " })).toBe(true);
    expect(isDefaultName(filled)).toBe(false);
  });
});

describe("parseOptionalNumber（清空/中间态不再归零）", () => {
  it("空串返回 fallback（默认 undefined）而不是 0", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("   ")).toBeUndefined();
    expect(parseOptionalNumber("", 0.7)).toBe(0.7);
  });

  it("非法输入返回 fallback", () => {
    expect(parseOptionalNumber("abc")).toBeUndefined();
    expect(parseOptionalNumber("abc", 2048)).toBe(2048);
  });

  it("合法数字正常解析（含前后空白）", () => {
    expect(parseOptionalNumber("1.5")).toBe(1.5);
    expect(parseOptionalNumber(" 2048 ")).toBe(2048);
    expect(parseOptionalNumber("0")).toBe(0);
  });
});

describe("mergeFormValues（以界面实际输入为准）", () => {
  it("接管表单里的文本：粘贴/自动填充没进 state 的内容也不会丢", () => {
    const merged = mergeFormValues(filled, {
      name: "我的Claude",
      baseUrl: "https://proxy.example.com/anthropic",
      apiKey: "sk-ant-pasted",
      model: "claude-sonnet-4",
    });
    expect(merged.apiKey).toBe("sk-ant-pasted");
    expect(merged.baseUrl).toBe("https://proxy.example.com/anthropic");
    expect(merged.model).toBe("claude-sonnet-4");
  });

  it("清空文本字段按用户意图生效（空串就是空）", () => {
    const merged = mergeFormValues(filled, { apiKey: "", model: "" });
    expect(merged.apiKey).toBe("");
    expect(merged.model).toBe("");
  });

  it("未渲染的字段（undefined）保持原值", () => {
    const merged = mergeFormValues(filled, { name: undefined });
    expect(merged).toEqual(filled);
  });

  it("数字留空沿用原值，不会跳成 0；合法数字正常覆盖", () => {
    expect(mergeFormValues(filled, { temperature: "", maxTokens: "   " }))
      .toMatchObject({ temperature: 1.2, maxTokens: 8192 });
    expect(mergeFormValues(filled, { temperature: "0.0", maxTokens: "4096" }))
      .toMatchObject({ temperature: 0, maxTokens: 4096 });
  });

  it("勾选框以表单为准", () => {
    expect(
      mergeFormValues(filled, { useMaxCompletionTokens: true })
        .useMaxCompletionTokens
    ).toBe(true);
    expect(
      mergeFormValues(
        { ...filled, useMaxCompletionTokens: true },
        { useMaxCompletionTokens: false }
      ).useMaxCompletionTokens
    ).toBe(false);
  });
});

describe("normalizeConfig（保存前归一化）", () => {
  it("去空白、修正越界数字、空 Key 归一", () => {
    const saved = normalizeConfig({
      ...filled,
      name: "  我的Claude  ",
      baseUrl: " https://api.anthropic.com/v1/// ",
      model: " claude-sonnet-4 ",
      temperature: 5,
      maxTokens: 0,
      apiKey: "   ",
    });
    expect(saved.name).toBe("我的Claude");
    expect(saved.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(saved.model).toBe("claude-sonnet-4");
    expect(saved.temperature).toBe(2);
    expect(saved.maxTokens).toBe(1);
    expect(saved.apiKey).toBeUndefined();
    expect(saved.id).toBe("c-1");
    expect(saved.isDefault).toBe(true);
  });

  it("名称为空时回落到提供商默认名，undefined 数字保持不变", () => {
    const saved = normalizeConfig({
      id: "c-2",
      providerId: "ollama",
      name: "   ",
      baseUrl: "http://localhost:11434",
      model: "qwen2.5",
    });
    expect(saved.name).toBe("Ollama 本地");
    expect(saved.temperature).toBeUndefined();
    expect(saved.maxTokens).toBeUndefined();
  });
});

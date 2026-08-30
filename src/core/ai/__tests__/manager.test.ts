import { describe, it, expect, vi, afterEach } from "vitest";
import { ProviderManager } from "../manager";
import { openAIConfig, ollamaConfig, mockJSONResponse } from "./helpers";

describe("ProviderManager", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("未配置任何服务时给出明确错误", async () => {
    const mgr = new ProviderManager();
    mgr.setConfigs([]);
    await expect(
      (async () => {
        for await (const _c of mgr.chat({
          messages: [{ role: "user", content: "hi" }],
        })) {
          // consume
        }
      })()
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("自动选择默认配置；切换默认后生效", async () => {
    const mgr = new ProviderManager();
    const c2 = { ...ollamaConfig, isDefault: false };
    mgr.setConfigs([{ ...openAIConfig, isDefault: true }, c2]);
    expect(mgr.getActiveConfig()?.id).toBe(openAIConfig.id);

    mgr.setDefault(ollamaConfig.id);
    expect(mgr.getActiveConfig()?.id).toBe(ollamaConfig.id);
    expect(mgr.getConfigs().filter((c) => c.isDefault)).toHaveLength(1);
  });

  it("无默认配置时自动指定第一个", () => {
    const mgr = new ProviderManager();
    mgr.setConfigs([{ ...openAIConfig }, { ...ollamaConfig }]);
    expect(mgr.getActiveConfig()?.id).toBe(openAIConfig.id);
  });

  it("upsert 新增与更新配置", () => {
    const mgr = new ProviderManager();
    mgr.upsertConfig({ ...openAIConfig, isDefault: true });
    expect(mgr.getConfigs()).toHaveLength(1);
    mgr.upsertConfig({ ...openAIConfig, model: "gpt-5" });
    expect(mgr.getConfigs()).toHaveLength(1);
    expect(mgr.getConfigs()[0].model).toBe("gpt-5");
  });

  it("testConnection：连接成功返回模型列表", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJSONResponse({
          data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
        })
      )
    );
    const mgr = new ProviderManager();
    const res = await mgr.testConnection(openAIConfig);
    expect(res.ok).toBe(true);
    expect(res.models).toContain("gpt-4o");
  });

  it("testConnection：配置缺失时直接失败，不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mgr = new ProviderManager();
    const res = await mgr.testConnection({ ...openAIConfig, model: "" });
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

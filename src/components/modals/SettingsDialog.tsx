/**
 * AI 设置对话框（最小版）
 * 管理多提供商配置：列表 / 编辑 / 默认切换 / 测试连接
 * 持久化到 settings('ai.providers')
 */
import { useEffect, useState } from "react";
import { Check, Download, Plus, RefreshCw, Trash2, Upload, Trash } from "lucide-react";
import { providerManager } from "../../core/ai/manager";
import type { ProviderConfig, ProviderId } from "../../core/ai/types";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";
import { RecycleBinDialog } from "./RecycleBinDialog";

const PROVIDER_META: Record<
  ProviderId,
  { label: string; defaultBaseUrl: string; needKey: boolean }
> = {
  openai: { label: "OpenAI 兼容", defaultBaseUrl: "https://api.openai.com/v1", needKey: false },
  anthropic: { label: "Anthropic Claude", defaultBaseUrl: "https://api.anthropic.com", needKey: true },
  ollama: { label: "Ollama 本地", defaultBaseUrl: "http://localhost:11434", needKey: false },
};

function blankConfig(providerId: ProviderId): ProviderConfig {
  const meta = PROVIDER_META[providerId];
  return {
    id: crypto.randomUUID(),
    providerId,
    name: providerId === "openai" ? "默认" : meta.label,
    baseUrl: meta.defaultBaseUrl,
    apiKey: "",
    model: "",
    temperature: 0.7,
    maxTokens: 2048,
    useMaxCompletionTokens: false,
  };
}

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const exportData = useChatStore((s) => s.exportData);
  const importData = useChatStore((s) => s.importData);
  const exportMarkdown = useChatStore((s) => s.exportMarkdown);
  const importMarkdown = useChatStore((s) => s.importMarkdown);
  const cleanupNow = useChatStore((s) => s.cleanupNow);
  const backupNow = useChatStore((s) => s.backupNow);
  const [cleanupEnabled, setCleanupEnabled] = useState(true);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupInterval, setBackupInterval] = useState(3);
  const [defaultInherit, setDefaultInherit] = useState(10);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setConfigs([...providerManager.getConfigs()]);
      setEditing(null);
      setTestResult(null);
      // 加载清理设置
      useChatStore
        .getState()
        .repos?.settings.get<{ enabled?: boolean; days?: number }>("cleanup", {
          enabled: true,
          days: 30,
        })
        .then((s) => {
          setCleanupEnabled(s.enabled !== false);
          setCleanupDays(s.days ?? 30);
        });
      // 加载备份设置与默认继承数量
      void useChatStore
        .getState()
        .repos?.settings.get<{ enabled?: boolean; intervalDays?: number }>(
          "backup",
          { enabled: true, intervalDays: 3 }
        )
        .then((s) => {
          setBackupEnabled(s.enabled !== false);
          setBackupInterval(s.intervalDays ?? 3);
        });
      void useChatStore
        .getState()
        .repos?.settings.get<number>("ai.defaultInheritCount", 10)
        .then((v) => setDefaultInherit(v));
    }
  }, [open]);

  /** 保存清理设置 */
  const saveCleanup = (enabled: boolean, days: number) => {
    useChatStore.getState().repos?.settings.set("cleanup", { enabled, days });
  };

  /** 保存备份设置 */
  const saveBackup = (enabled: boolean, intervalDays: number) => {
    useChatStore
      .getState()
      .repos?.settings.set("backup", { enabled, intervalDays });
  };

  const persist = async (list: ProviderConfig[]) => {
    providerManager.setConfigs(list);
    await useChatStore.getState().repos?.settings.set("ai.providers", list);
    setConfigs([...list]);
  };

  const handleSave = async () => {
    if (!editing) return;
    const err = providerManager.validateConfig(editing);
    if (err) {
      setTestResult(`⚠️ ${err}`);
      return;
    }
    const list = [...configs];
    const idx = list.findIndex((c) => c.id === editing.id);
    if (idx >= 0) list[idx] = editing;
    else list.push(editing);
    await persist(list);
    setEditing(null);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!editing) return;
    setTesting(true);
    setTestResult(null);
    const res = await providerManager.testConnection(editing);
    setTestResult(res.ok ? `✅ ${res.message}` : `❌ ${res.message}`);
    setTesting(false);
  };

  return (
    <>
    <Modal open={open} title="AI 设置" onClose={onClose} width={560}>
      <div className="flex flex-col gap-4">
        {/* 配置列表 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">已保存的配置</span>
            <button
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
              onClick={() => {
                setEditing(blankConfig("openai"));
                setTestResult(null);
              }}
            >
              <Plus size={12} /> 新增
            </button>
          </div>
          {configs.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-center text-xs text-neutral-300">
              暂无配置，点击"新增"添加
            </div>
          )}
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: c.isDefault ? "#1a1a1a" : "#d4d4d4" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-neutral-800">
                  {c.name}
                  {c.isDefault && (
                    <span className="ml-1.5 text-[10px] font-normal text-neutral-400">
                      默认
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-neutral-400">
                  {PROVIDER_META[c.providerId].label} · {c.model || "未设置模型"} · {c.baseUrl}
                </div>
              </div>
              {!c.isDefault && (
                <button
                  className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  title="设为默认"
                  onClick={() =>
                    persist(configs.map((x) => ({ ...x, isDefault: x.id === c.id })))
                  }
                >
                  <Check size={13} />
                </button>
              )}
              <button
                className="rounded-md p-1 text-neutral-300 hover:bg-neutral-100 hover:text-red-500"
                title="删除"
                onClick={() => persist(configs.filter((x) => x.id !== c.id))}
              >
                <Trash2 size={13} />
              </button>
              <button
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                onClick={() => {
                  setEditing({ ...c });
                  setTestResult(null);
                }}
              >
                编辑
              </button>
            </div>
          ))}
        </div>

        {/* 上下文设置 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 text-xs text-neutral-500">上下文设置</div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-600">
                分支默认继承消息数
              </span>
              <input
                type="number"
                min={1}
                max={100}
                className="w-20 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-neutral-400"
                value={defaultInherit}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDefaultInherit(v);
                  void useChatStore
                    .getState()
                    .repos?.settings.set("ai.defaultInheritCount", v);
                }}
              />
            </div>
            <div className="text-[10px] text-neutral-400">
              分支创建对话框中的默认值；发送时上下文超过限制会提示分叉（设置 ai.contextLimit 可调上限）
            </div>
          </div>
        </div>

        {/* 存储管理 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 text-xs text-neutral-500">存储管理</div>
          <div className="flex flex-col gap-2.5">
            {/* 自动备份 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-700">自动备份</div>
                <div className="text-[10px] text-neutral-400">
                  启动时检查，超过间隔自动备份到 文档/AITreeBackups/
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <select
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-400"
                  value={backupInterval}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBackupInterval(v);
                    saveBackup(backupEnabled, v);
                  }}
                >
                  <option value={1}>每天</option>
                  <option value={3}>每3天</option>
                  <option value={7}>每周</option>
                </select>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-neutral-800"
                  checked={backupEnabled}
                  onChange={(e) => {
                    setBackupEnabled(e.target.checked);
                    saveBackup(e.target.checked, backupInterval);
                  }}
                />
              </label>
            </div>

            {/* 自动清理 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-700">自动清理不活跃分支</div>
                <div className="text-[10px] text-neutral-400">
                  保护：收藏 / 保留 / 分组 / 便签关联的节点不会被清理
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <select
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-400"
                  value={cleanupDays}
                  onChange={(e) => {
                    const d = Number(e.target.value);
                    setCleanupDays(d);
                    saveCleanup(cleanupEnabled, d);
                  }}
                >
                  <option value={7}>7天（激进）</option>
                  <option value={30}>30天（推荐）</option>
                  <option value={90}>90天（保守）</option>
                </select>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-neutral-800"
                  checked={cleanupEnabled}
                  onChange={(e) => {
                    setCleanupEnabled(e.target.checked);
                    saveCleanup(e.target.checked, cleanupDays);
                  }}
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                onClick={() => void cleanupNow()}
              >
                <RefreshCw size={12} /> 立即清理
              </button>
              <button
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                onClick={() => void backupNow()}
              >
                <Download size={12} /> 立即备份
              </button>
              <button
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                onClick={() => setRecycleBinOpen(true)}
              >
                <Trash size={12} /> 回收站
              </button>
            </div>
          </div>
        </div>

        {/* 数据管理 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-neutral-500">数据管理</span>
            <span className="text-[10px] text-neutral-300">
              完整备份 / 覆盖恢复（Ctrl+E 导出 · Ctrl+I 导入）
            </span>
          </div>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
              onClick={() => void exportData()}
            >
              <Download size={12} />
              导出 JSON 备份
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
              onClick={() => void importData()}
            >
              <Upload size={12} />
              导入 JSON 备份
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
              onClick={() => void exportMarkdown()}
            >
              <Download size={12} />
              导出 Markdown
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
              onClick={() => void importMarkdown()}
            >
              <Upload size={12} />
              导入 Markdown
            </button>
          </div>
        </div>

        {/* 编辑表单 */}
        {editing && (
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="提供商">
                <select
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.providerId}
                  onChange={(e) => {
                    const pid = e.target.value as ProviderId;
                    setEditing({ ...blankConfig(pid), id: editing.id, name: editing.name });
                  }}
                >
                  {Object.entries(PROVIDER_META).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="名称">
                <input
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <Field label="API 地址 (baseUrl)" wide>
                <input
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  placeholder={PROVIDER_META[editing.providerId].defaultBaseUrl}
                />
              </Field>
              <Field label="API Key" wide>
                <input
                  type="password"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.apiKey ?? ""}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  placeholder={PROVIDER_META[editing.providerId].needKey ? "必填" : "可选（本地服务可留空）"}
                />
              </Field>
              <Field label="模型">
                <input
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  placeholder="如 gpt-4o-mini / qwen2.5"
                />
              </Field>
              <Field label="温度">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.temperature ?? 0.7}
                  onChange={(e) =>
                    setEditing({ ...editing, temperature: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="最大 Token">
                <input
                  type="number"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.maxTokens ?? 2048}
                  onChange={(e) =>
                    setEditing({ ...editing, maxTokens: Number(e.target.value) })
                  }
                />
              </Field>
              {editing.providerId === "openai" && (
                <Field label="新模型参数">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      className="accent-neutral-800"
                      checked={editing.useMaxCompletionTokens ?? false}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          useMaxCompletionTokens: e.target.checked,
                        })
                      }
                    />
                    使用 max_completion_tokens（GPT-5/o系列）
                  </label>
                </Field>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                onClick={handleTest}
                disabled={testing}
              >
                <RefreshCw size={12} className={testing ? "animate-spin" : ""} />
                测试连接
              </button>
              {testResult && (
                <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-500">
                  {testResult}
                </span>
              )}
              <div className="flex-1" />
              <button
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
                onClick={() => setEditing(null)}
              >
                取消编辑
              </button>
              <button
                className="rounded-xl bg-neutral-800 px-4 py-1.5 text-xs text-white hover:bg-neutral-700"
                onClick={handleSave}
              >
                保存配置
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>

    {/* 回收站 */}
    <RecycleBinDialog
      open={recycleBinOpen}
      onClose={() => setRecycleBinOpen(false)}
    />
    </>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <label className="mb-1 block text-[11px] text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

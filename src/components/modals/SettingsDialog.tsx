/**
 * AI 设置对话框（最小版）
 * 管理多提供商配置：列表 / 编辑 / 默认切换 / 测试连接
 * 持久化到 settings('ai.providers')
 */
import { useEffect, useRef, useState } from "react";
import { Check, Download, FolderOpen, Plus, RefreshCw, Trash2, Upload, Trash } from "lucide-react";
import { providerManager } from "../../core/ai/manager";
import type { ProviderConfig, ProviderId } from "../../core/ai/types";
import {
  blankConfig,
  cloneConfig,
  mergeFormValues,
  normalizeConfig,
  PROVIDER_META,
  switchProviderConfig,
} from "../../core/ai/configDraft";
import { useChatStore } from "../../store/chatStore";
import { chooseDirectory } from "../../core/io/files";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getAppDataDir } from "../../core/io/appPaths";
import {
  getAppVersion,
  getLastUpdateResult,
  runUpdateCheck,
} from "../../core/update/service";
import {
  RELEASE_PAGE_URL,
  summarizeNotes,
  type UpdateCheckResult,
} from "../../core/update/release";
import { getNotesDir } from "../../core/notes/noteService";
import { Modal } from "../common/Modal";
import { RecycleBinDialog } from "./RecycleBinDialog";

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
  const importDeepSeekExport = useChatStore((s) => s.importDeepSeekExport);
  const cleanupNow = useChatStore((s) => s.cleanupNow);
  const backupNow = useChatStore((s) => s.backupNow);
  const [cleanupEnabled, setCleanupEnabled] = useState(true);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupInterval, setBackupInterval] = useState(3);
  const [notifyDuration, setNotifyDuration] = useState(6);
  const [notifySuccess, setNotifySuccess] = useState(true);
  const [notifyInfo, setNotifyInfo] = useState(true);
  const [notesDir, setNotesDir] = useState("");
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  // 上下文继承：全局默认条数 + 当前树策略
  const [defaultInheritCount, setDefaultInheritCount] = useState(5);
  const [treeName, setTreeName] = useState("");
  const [treeMode, setTreeMode] = useState<"count" | "all" | "none">("count");
  const [treeCount, setTreeCount] = useState(5);
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
  // 关于与更新
  const [appVersion, setAppVersion] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(
    null
  );
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(true);
  /** AI 配置编辑表单容器：保存/测试时以 DOM 中的实际输入为准 */
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // 副本：列表渲染与编辑草稿都不与 providerManager 内部对象共享引用
      setConfigs(providerManager.getConfigs().map(cloneConfig));
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
      // 加载通知设置
      void useChatStore
        .getState()
        .repos?.settings
        .get<{ duration?: number; types?: { success?: boolean; info?: boolean } }>(
          "notification",
          { duration: 6, types: { success: true, info: true } }
        )
        .then((s) => {
          setNotifyDuration(s.duration ?? 6);
          setNotifySuccess(s.types?.success !== false);
          setNotifyInfo(s.types?.info !== false);
        });
      // 加载便签存储目录
      const cs = useChatStore.getState();
      if (cs.repos) void getNotesDir(cs.repos).then(setNotesDir);
      // 加载上下文继承：全局默认 + 当前树策略
      void cs.repos?.settings
        .get<number>("ai.defaultInheritCount", 5)
        .then((v) => setDefaultInheritCount(v ?? 5));
      setCurrentTreeId(cs.currentTreeId);
      if (cs.repos && cs.currentTreeId) {
        void cs.repos.trees.getById(cs.currentTreeId).then((tree) => {
          if (!tree) return;
          setTreeName(tree.name);
          setTreeMode(tree.inheritMode);
          setTreeCount(tree.inheritCount || 5);
        });
      } else {
        setTreeName("");
      }
      // 关于与更新：版本号 + 上次检查结果（启动时可能已经查过一次）
      void getAppVersion().then(setAppVersion);
      setUpdateResult(getLastUpdateResult());
      void cs.repos?.settings
        .get<boolean>("update.checkOnStartup", true)
        .then((v) => setAutoCheckUpdate(v !== false));
    }
  }, [open]);

  /** 保存便签存储目录 */
  const saveNotesDir = (dir: string) => {
    const cs = useChatStore.getState();
    cs.repos?.settings.set("notes.storageDir", dir.trim() || null);
    setNotesDir(dir.trim() || (cs.repos ? "" : ""));
  };

  const pickNotesDir = async () => {
    const dir = await chooseDirectory();
    if (dir) saveNotesDir(dir);
  };

  /** 保存通知设置（写库 + 更新 store 缓存） */
  const saveNotification = (
    duration: number,
    types: { success: boolean; info: boolean }
  ) => {
    const cs = useChatStore.getState();
    cs.repos?.settings.set("notification", { duration, types });
    cs.setNotifyDuration(duration);
    cs.setNotifyTypes(types);
  };

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

  /** 保存全局默认继承条数（分支对话框的初始值） */
  const saveDefaultInheritCount = (value: number) => {
    const v = Math.max(1, Math.min(100, Math.round(value || 1)));
    setDefaultInheritCount(v);
    useChatStore.getState().repos?.settings.set("ai.defaultInheritCount", v);
  };

  /** 保存当前树的上下文策略（建树后也能改，不影响已建分支） */
  const saveTreePolicy = (
    mode: "count" | "all" | "none",
    count: number
  ) => {
    const cs = useChatStore.getState();
    setTreeMode(mode);
    if (mode === "count") setTreeCount(count);
    const treeId = currentTreeId ?? cs.currentTreeId;
    if (!cs.repos || !treeId) return;
    void cs.repos.trees.updatePolicy(treeId, {
      inheritMode: mode,
      inheritCount:
        mode === "count"
          ? Math.max(1, Math.min(100, Math.round(count || 1)))
          : 0,
    });
  };

  /** 在访达中显示数据目录（数据库 / 备份都在这里） */
  const openDataDir = async () => {
    const dir = await getAppDataDir();
    if (!dir) return;
    try {
      await revealItemInDir(dir);
    } catch {
      // 失败静默（例如目录不存在）
    }
  };

  /** 手动检查更新 */
  const doCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    const result = await runUpdateCheck();
    setUpdateResult(result);
    setCheckingUpdate(false);
  };

  /** 启动时静默检查（不打断，只在有新版时提示一句） */
  const saveAutoCheckUpdate = (enabled: boolean) => {
    setAutoCheckUpdate(enabled);
    useChatStore
      .getState()
      .repos?.settings.set("update.checkOnStartup", enabled);
  };

  const persist = async (list: ProviderConfig[]) => {
    providerManager.setConfigs(list);
    await useChatStore.getState().repos?.settings.set("ai.providers", list);
    setConfigs([...list]);
  };

  /** 打开编辑器：始终基于副本，避免与 providerManager 内部对象共享引用 */
  const openEditor = (config: ProviderConfig) => {
    setEditing(cloneConfig(config));
    setTestResult(null);
  };

  /** 表单字段节点（编辑表单里的输入框都是非受控的，DOM 即唯一事实来源） */
  const fieldEl = (field: string) =>
    formRef.current?.querySelector<HTMLInputElement>(`[data-field="${field}"]`);

  /**
   * 读取表单当前值（以界面上实际看到的为准）。
   * 表单输入是非受控的：无论 typed / 粘贴 / 自动填充 / 输入法，
   * 只要界面上填了，保存和测试就读得到，不会被旧状态覆盖。
   */
  const readForm = (base: ProviderConfig): ProviderConfig =>
    mergeFormValues(base, {
      name: fieldEl("name")?.value,
      baseUrl: fieldEl("baseUrl")?.value,
      apiKey: fieldEl("apiKey")?.value,
      model: fieldEl("model")?.value,
      temperature: fieldEl("temperature")?.value,
      maxTokens: fieldEl("maxTokens")?.value,
      useMaxCompletionTokens: fieldEl("useMaxCompletionTokens")?.checked,
      supportsVision: fieldEl("supportsVision")?.checked,
    });

  /** 写回表单字段（仅用于切换提供商时刷新默认地址/名称） */
  const writeField = (field: string, value: string) => {
    const el = fieldEl(field);
    if (el) el.value = value;
  };

  /** 切换提供商：只刷新未自定义的地址/名称，其余已填内容原样保留 */
  const switchProvider = (pid: ProviderId) => {
    if (!editing) return;
    const next = switchProviderConfig(readForm(editing), pid);
    writeField("baseUrl", next.baseUrl);
    writeField("name", next.name);
    setEditing(next);
  };

  const handleSave = async () => {
    if (!editing) return;
    const next = normalizeConfig(readForm(editing));
    const err = providerManager.validateConfig(next);
    if (err) {
      setTestResult(`⚠️ ${err}`);
      return;
    }
    const list = [...configs];
    const idx = list.findIndex((c) => c.id === next.id);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    await persist(list);
    setEditing(null);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!editing) return;
    setTesting(true);
    setTestResult(null);
    const res = await providerManager.testConnection(
      normalizeConfig(readForm(editing))
    );
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
              className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
              onClick={() => openEditor(blankConfig("openai"))}
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
                    <span className="ml-1.5 rounded bg-neutral-800 px-1 py-px text-[9px] font-normal text-white">
                      当前使用
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-neutral-400">
                  {PROVIDER_META[c.providerId].label} · {c.model || "未设置模型"} · {c.baseUrl}
                </div>
              </div>
              {!c.isDefault && (
                <button
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-neutral-300 px-1.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                  title="切换为当前使用的 AI 服务"
                  onClick={() =>
                    persist(configs.map((x) => ({ ...x, isDefault: x.id === c.id })))
                  }
                >
                  <Check size={11} /> 使用
                </button>
              )}
              <button
                className="shrink-0 rounded-md p-1 text-neutral-300 hover:bg-neutral-100 hover:text-red-500"
                title="删除"
                onClick={() => persist(configs.filter((x) => x.id !== c.id))}
              >
                <Trash2 size={13} />
              </button>
              <button
                className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                onClick={() => openEditor(c)}
              >
                编辑
              </button>
            </div>
          ))}
        </div>

        {/* 上下文继承 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 text-xs text-neutral-500">上下文继承</div>
          <div className="flex flex-col gap-3">
            {/* 当前树策略 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-neutral-700">
                  当前树策略{treeName ? `（${treeName}）` : "（未选择树）"}
                </span>
                {treeMode === "count" && (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[11px] text-neutral-400">最近</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={treeCount}
                      onChange={(e) =>
                        saveTreePolicy("count", Number(e.target.value))
                      }
                      className="w-14 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right text-[11px] outline-none focus:border-neutral-400"
                    />
                    <span className="text-[11px] text-neutral-400">条</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    { value: "count", label: "最近 N 条" },
                    { value: "all", label: "全部继承" },
                    { value: "none", label: "每轮全新" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.value}
                    onClick={() => saveTreePolicy(m.value, treeCount)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                      treeMode === m.value
                        ? "border-neutral-500 bg-neutral-50 text-neutral-800"
                        : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] leading-relaxed text-neutral-400">
                对普通对话生效；分支的方向在创建分支时各自选择，建好后不受树策略影响
              </div>
            </div>

            {/* 全局默认 */}
            <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-2.5">
              <div className="min-w-0">
                <div className="text-xs text-neutral-700">默认继承条数</div>
                <div className="text-[10px] text-neutral-400">
                  创建分支时「继承最近 N 条」的初始值；条数按消息计（一问一答 = 2 条）
                </div>
              </div>
              <input
                type="number"
                min={1}
                max={100}
                value={defaultInheritCount}
                onChange={(e) =>
                  saveDefaultInheritCount(Number(e.target.value))
                }
                className="w-14 shrink-0 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right text-[11px] outline-none focus:border-neutral-400"
              />
            </div>
          </div>
        </div>

        {/* 通知设置 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 text-xs text-neutral-500">通知设置</div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-600">显示时长</span>
              <select
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-400"
                value={notifyDuration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setNotifyDuration(v);
                  saveNotification(v, {
                    success: notifySuccess,
                    info: notifyInfo,
                  });
                }}
              >
                <option value={3}>3 秒</option>
                <option value={5}>5 秒</option>
                <option value={8}>8 秒</option>
                <option value={10}>10 秒</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-neutral-600">
                成功通知（收藏/分组/备份等）
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-neutral-800"
                checked={notifySuccess}
                onChange={(e) => {
                  setNotifySuccess(e.target.checked);
                  saveNotification(notifyDuration, {
                    success: e.target.checked,
                    info: notifyInfo,
                  });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-neutral-600">
                提示通知（清理/上下文耗尽等）
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-neutral-800"
                checked={notifyInfo}
                onChange={(e) => {
                  setNotifyInfo(e.target.checked);
                  saveNotification(notifyDuration, {
                    success: notifySuccess,
                    info: e.target.checked,
                  });
                }}
              />
            </div>
            <div className="truncate text-[10px] text-neutral-400">
              错误通知始终显示，不在此控制
            </div>
          </div>
        </div>

        {/* 便签存储 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 text-xs text-neutral-500">便签存储</div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-600 outline-none focus:border-neutral-400"
                value={notesDir}
                onChange={(e) => saveNotesDir(e.target.value)}
                placeholder="便签目录（默认 文档/AITreeNotes）"
              />
              <button
                className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-100"
                onClick={() => void pickNotesDir()}
                title="选择目录"
              >
                <FolderOpen size={12} /> 选择
              </button>
            </div>
            <div
              className="truncate text-[10px] text-neutral-400"
              title={`便签以独立 Markdown 文件存储于此目录；在便签板中设置"分类"可创建子目录。修改路径后，新便签写入新位置（已有便签文件不自动迁移）。`}
            >
              便签以独立 Markdown 文件存储于此目录，分类可创建子目录；修改路径后新便签写入新位置
            </div>
          </div>
        </div>

        {/* 存储管理 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 text-xs text-neutral-500">存储管理</div>
          <div className="flex flex-col gap-2.5">
            {/* 自动备份 */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-neutral-700">自动备份</div>
                <div className="truncate text-[10px] text-neutral-400">
                  启动时检查，超过间隔自动备份
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-neutral-700">自动清理不活跃分支</div>
                <div className="truncate text-[10px] text-neutral-400">
                  保护：收藏 / 保留 / 分组 / 便签关联
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
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

            <div className="grid grid-cols-3 gap-2">
              <DataButton icon={<RefreshCw size={12} />} label="立即清理" onClick={() => void cleanupNow()} />
              <DataButton icon={<Download size={12} />} label="立即备份" onClick={() => void backupNow()} />
              <DataButton icon={<Trash size={12} />} label="回收站" onClick={() => setRecycleBinOpen(true)} />
            </div>
          </div>
        </div>

        {/* 数据管理 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="whitespace-nowrap text-xs text-neutral-500">
              数据管理
            </span>
            <span className="truncate whitespace-nowrap text-right text-[10px] text-neutral-300">
              完整备份 / 覆盖恢复（Ctrl+E 导出 · Ctrl+I 导入）
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DataButton icon={<Download size={12} />} label="导出 JSON 备份" onClick={() => void exportData()} />
            <DataButton icon={<Upload size={12} />} label="导入 JSON 备份" onClick={() => void importData()} />
            <DataButton icon={<Download size={12} />} label="导出 Markdown" onClick={() => void exportMarkdown()} />
            <DataButton icon={<Upload size={12} />} label="导入 Markdown" onClick={() => void importMarkdown()} />
            <DataButton
              icon={<Upload size={12} />}
              label="导入 DeepSeek"
              title="导入 DeepSeek 导出包：每个会话一棵树，一问一答一个节点"
              onClick={() => void importDeepSeekExport()}
            />
            <DataButton
              icon={<FolderOpen size={12} />}
              label="打开数据目录"
              title="在访达中打开数据库 / 备份所在目录"
              onClick={() => void openDataDir()}
            />
          </div>
        </div>

        {/* 关于与更新 */}
        <div className="rounded-xl border border-neutral-200 p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="whitespace-nowrap text-xs text-neutral-500">
              关于与更新
            </span>
            <span className="truncate text-[10px] text-neutral-300">
              当前版本 {appVersion || "—"}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => void doCheckUpdate()}
                disabled={checkingUpdate}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
              >
                <RefreshCw
                  size={12}
                  className={checkingUpdate ? "animate-spin" : ""}
                />
                {checkingUpdate ? "检查中…" : "检查更新"}
              </button>
              <button
                onClick={() => void openUrl(RELEASE_PAGE_URL)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-500 hover:bg-neutral-100"
              >
                <Download size={12} /> 发布页
              </button>
              <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-neutral-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-neutral-800"
                  checked={autoCheckUpdate}
                  onChange={(e) => saveAutoCheckUpdate(e.target.checked)}
                />
                启动时检查
              </label>
            </div>

            {updateResult?.error && (
              <div className="text-[10px] text-neutral-400">
                {updateResult.error}
              </div>
            )}
            {updateResult && !updateResult.error && !updateResult.hasUpdate && (
              <div className="text-[10px] text-neutral-400">
                已是最新版本（{updateResult.latest?.version ?? appVersion}）
              </div>
            )}
            {updateResult?.hasUpdate && updateResult.latest && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-neutral-800">
                    发现新版本 {updateResult.latest.version}
                  </span>
                  <button
                    onClick={() =>
                      void openUrl(updateResult.latest!.downloadUrl)
                    }
                    className="shrink-0 rounded-lg bg-neutral-800 px-2.5 py-1 text-[11px] text-white hover:bg-neutral-700"
                  >
                    {updateResult.latest.hasPlatformAsset
                      ? "下载安装包"
                      : "打开发布页"}
                  </button>
                </div>
                {updateResult.latest.notes && (
                  <div className="mt-1.5 line-clamp-6 whitespace-pre-wrap text-[10px] leading-relaxed text-neutral-500">
                    {summarizeNotes(updateResult.latest.notes)}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-neutral-400">
                  {updateResult.latest.hasPlatformAsset
                    ? "下载后拖入「应用程序」覆盖安装，数据不会丢"
                    : "该版本暂未上传 macOS 安装包，可在发布页查看"}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </Modal>

    {/* 编辑 AI 配置（独立弹窗）：不响应点击遮罩，避免误点丢掉已填内容 */}
    <Modal
      open={editing !== null}
      title="编辑 AI 配置"
      onClose={() => setEditing(null)}
      width={560}
      closeOnBackdrop={false}
    >
      {editing && (
          // key：切换编辑对象（新增/编辑另一条）时重建表单，重新套用各字段初始值
          <div
            key={editing.id}
            ref={formRef}
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="提供商">
                <select
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  value={editing.providerId}
                  // 下拉获得焦点时滚轮/键盘会静默改值 → 滚轮先失焦，避免"滚一下就换提供商"
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => switchProvider(e.target.value as ProviderId)}
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
                  data-field="name"
                  defaultValue={editing.name}
                  autoComplete="off"
                />
              </Field>
              <Field label="API 地址 (baseUrl)" wide>
                <input
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  data-field="baseUrl"
                  defaultValue={editing.baseUrl}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={PROVIDER_META[editing.providerId].defaultBaseUrl}
                />
              </Field>
              <Field label="API Key" wide>
                <input
                  type="password"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  data-field="apiKey"
                  defaultValue={editing.apiKey ?? ""}
                  // 自动填充会在聚焦/输入时改写字段（甚至清掉刚填的内容）→ 关闭
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={PROVIDER_META[editing.providerId].needKey ? "必填" : "可选（本地服务可留空）"}
                />
              </Field>
              <Field label="模型">
                <input
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
                  data-field="model"
                  defaultValue={editing.model}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="如 gpt-4o-mini / qwen2.5"
                />
              </Field>
              {/* 数字框用非受控 + 保存时读 DOM：原生上下箭头改的是 DOM，
                  若由 state 反写，任何一次重渲染都会把箭头刚调好的值打回去 */}
              <NumberField
                label="温度"
                field="temperature"
                defaultValue={editing.temperature}
                fallback={0.7}
                step={0.1}
                min={0}
                max={2}
              />
              <NumberField
                label="最大 Token"
                field="maxTokens"
                defaultValue={editing.maxTokens}
                fallback={2048}
                step={1}
                min={1}
              />
              {editing.providerId !== "ollama" && (
                <Field label="多模态">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      className="accent-neutral-800"
                      data-field="supportsVision"
                      defaultChecked={
                        editing.supportsVision ??
                        editing.providerId === "anthropic"
                      }
                    />
                    支持读图（视觉模型，可附带图片提问）
                  </label>
                </Field>
              )}
              {editing.providerId === "openai" && (
                <Field label="新模型参数">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      className="accent-neutral-800"
                      data-field="useMaxCompletionTokens"
                      defaultChecked={editing.useMaxCompletionTokens ?? false}
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
      <label className="mb-1 block truncate text-[11px] text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

/**
 * 数字输入框（非受控）。
 * 原生上下箭头改的是 DOM 值：若让 React 用 state 反写，任何一次重渲染
 * 都会把刚调好的值打回去（表现为"点调整按钮就被重置"）。
 * 这里只做初始值 + 滚轮防误改，实际值在保存时从 DOM 读取。
 */
function NumberField({
  label,
  field,
  defaultValue,
  fallback,
  step,
  min,
  max,
}: {
  label: string;
  /** data-field 名称（保存时按此读取） */
  field: string;
  defaultValue: number | undefined;
  /** 空值时的默认值（仅作占位提示） */
  fallback: number;
  step: number;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        autoComplete="off"
        data-field={field}
        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
        defaultValue={defaultValue === undefined ? "" : String(defaultValue)}
        placeholder={String(fallback)}
        onWheel={(e) => e.currentTarget.blur()}
      />
    </Field>
  );
}

/** 数据/操作按钮：统一高度、单行文本、极简黑白灰 */
function DataButton({
  icon,
  label,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      className="flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-300 text-xs text-neutral-600 transition-colors hover:bg-neutral-100"
      onClick={onClick}
    >
      <span className="text-neutral-400">{icon}</span>
      {label}
    </button>
  );
}

/**
 * 圆角输入卡片：操作栏（分支切换/分叉/上级/新建/设置）+ 输入框 + 发送
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  ChevronDown,
  Plus,
  Quote,
  Send,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useChatStore, type BranchOption } from "../../store/chatStore";
import { getBranchLabel } from "../../core/tree/branchLabel";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useImeComposition } from "../../hooks/useImeComposition";
import { providerManager } from "../../core/ai/manager";
import type { ProviderConfig } from "../../core/ai/types";
import { BranchDialog } from "../modals/BranchDialog";
import { SettingsDialog } from "../modals/SettingsDialog";

export function InputCard() {
  const currentNodeId = useChatStore((s) => s.currentNodeId);
  const streaming = useChatStore((s) => s.streaming);
  const preparing = useChatStore((s) => s.preparing);
  const hasParent = useChatStore((s) => s.hasParent);
  const repos = useChatStore((s) => s.repos);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const navigateToParent = useChatStore((s) => s.navigateToParent);
  const quote = useChatStore((s) => s.quote);
  const clearQuote = useChatStore((s) => s.clearQuote);

  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [children, setChildren] = useState<BranchOption[]>([]);
  const branchMenuRef = useClickOutside<HTMLDivElement>(() => setMenuOpen(false), menuOpen);
  const [branchDialogFor, setBranchDialogFor] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const aiMenuRef = useClickOutside<HTMLDivElement>(
    () => setAiMenuOpen(false),
    aiMenuOpen
  );
  const [aiConfigs, setAiConfigs] = useState<ProviderConfig[]>([]);
  const activeAi = providerManager.getActiveConfig();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 输入框高度随内容自适应：单行起步 → 随行数增长 → 到上限后内部滚动
  useAutoGrowTextarea(textareaRef, text);

  // 输入法组字守卫：组字中的回车只确认候选词，不发送
  const { compositionProps, shouldIgnoreEnter } = useImeComposition();

  // AI 配置在 init 时异步加载：repos 就绪后同步一次（避免下拉永远为空）
  useEffect(() => {
    if (repos) setAiConfigs(providerManager.getConfigs());
  }, [repos]);

  /** 打开下拉时总是从 providerManager 刷新（覆盖设置中增删改后的场景） */
  const toggleAiMenu = () => {
    setAiConfigs(providerManager.getConfigs());
    setAiMenuOpen((v) => !v);
  };

  /** 快捷切换 AI 服务（切换默认配置并持久化） */
  const switchAi = async (configId: string) => {
    providerManager.setDefault(configId);
    const list = providerManager.getConfigs();
    setAiConfigs([...list]);
    const repos = useChatStore.getState().repos;
    await repos?.settings.set("ai.providers", list);
    const target = list.find((c) => c.id === configId);
    useChatStore.getState().setNotice(
      `🤖 已切换到「${target?.name ?? "AI"}」`
    );
    setAiMenuOpen(false);
  };

  // 加载当前节点的子分支（下拉切换用）
  useEffect(() => {
    if (!repos || !currentNodeId) {
      setChildren([]);
      return;
    }
    let cancelled = false;
    repos.nodes.getChildrenWithEdge(currentNodeId).then(async (cs) => {
      if (cancelled) return;
      const options: BranchOption[] = [];
      for (const c of cs) {
        options.push({
          nodeId: c.node.id,
          label: await getBranchLabel(repos, c.node),
          color: c.node.color,
          relationType: c.edge.relationType,
          isCurrent: false,
        });
      }
      if (!cancelled) setChildren(options);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, currentNodeId]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming || preparing) return;
    // 先清空输入框；若消息未被受理（如未配置 AI 服务），恢复文字避免丢失
    setText("");
    void sendMessage(trimmed).then((accepted) => {
      if (!accepted) setText(trimmed);
    });
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // 输入法组字中的回车是「确认候选词」，不能当成发送（否则拼音打到一半就被发出去）
      if (shouldIgnoreEnter(e)) return;
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-6 pb-5">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
          {/* 操作栏 */}
          <div className="flex items-center gap-1 px-3 pt-2.5 pb-1.5">
            {/* 分支切换 */}
            <div className="relative">
              <button
                className="flex max-w-[160px] items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                onClick={() => setMenuOpen((v) => !v)}
                title="切换分支"
              >
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-neutral-500" />
                <span className="truncate">
                  {currentNodeId ? "当前分支" : "未开始"}
                </span>
                <ChevronDown size={12} className="shrink-0 text-neutral-400" />
              </button>
              {menuOpen && (
                <div
                  ref={branchMenuRef}
                  className="absolute bottom-full left-0 z-40 mb-1 w-52 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
                >
                  <div className="px-3 py-1 text-[10px] text-neutral-400">
                    子分支（点击切换）
                  </div>
                  {children.length === 0 && (
                    <div className="px-3 py-1.5 text-xs text-neutral-300">
                      暂无子分支
                    </div>
                  )}
                  {children.map((c) => (
                    <button
                      key={c.nodeId}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                      onClick={() => {
                        navigateTo(c.nodeId);
                        setMenuOpen(false);
                      }}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: c.color }}
                      />
                      <span className="truncate">{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1 h-3.5 w-px bg-neutral-200" />

            <ToolButton
              icon={<Plus size={13} />}
              label="分叉"
              title="创建分支（新会话）"
              disabled={!currentNodeId}
              onClick={() => currentNodeId && setBranchDialogFor(currentNodeId)}
            />
            <ToolButton
              icon={<ArrowUp size={13} />}
              label="上级"
              title="返回上级（分支内直接回到分叉出来的那个节点）"
              disabled={!hasParent}
              onClick={() => navigateToParent()}
            />

            <div className="flex-1" />

            {/* AI 快捷切换 */}
            <div className="relative">
              <button
                className="flex max-w-[140px] items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                onClick={toggleAiMenu}
                title="切换 AI 服务"
              >
                <Sparkles size={12} className="shrink-0 text-neutral-400" />
                <span className="truncate">{activeAi?.name ?? "未配置 AI"}</span>
                <ChevronDown size={12} className="shrink-0 text-neutral-400" />
              </button>
              {aiMenuOpen && (
                <div
                  ref={aiMenuRef}
                  className="absolute bottom-full right-0 z-40 mb-1 w-52 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
                >
                  <div className="px-3 py-1 text-[10px] text-neutral-400">
                    AI 服务（点击切换）
                  </div>
                  {aiConfigs.length === 0 && (
                    <div className="px-3 py-1.5 text-xs text-neutral-300">
                      暂无配置，去设置中添加
                    </div>
                  )}
                  {aiConfigs.map((c) => (
                    <button
                      key={c.id}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                      onClick={() => void switchAi(c.id)}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: c.isDefault ? "#1a1a1a" : "#d4d4d4",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.isDefault && (
                        <span className="shrink-0 text-[9px] text-neutral-400">
                          使用中
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-neutral-100" />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-100"
                    onClick={() => {
                      setAiMenuOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings size={12} />
                    管理配置…
                  </button>
                </div>
              )}
            </div>

            <button
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              title="AI 设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={14} />
            </button>
          </div>

          {/* 引用卡片：选中 AI 内容后显示 */}
          {quote && (
            <div className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-neutral-200 border-l-2 border-l-neutral-400 bg-neutral-50 px-2.5 py-2">
              <Quote size={11} className="mt-0.5 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] text-neutral-400">
                  已引用一段回答，将结合其出处上下文回答
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-600">
                  {quote.text}
                </div>
              </div>
              <button
                className="shrink-0 rounded p-0.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500"
                title="移除引用"
                onClick={clearQuote}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* 输入区 */}
          <div className="flex items-end gap-2 px-3 pb-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              {...compositionProps}
              placeholder={
                preparing
                  ? "正在压缩上下文..."
                  : streaming
                    ? "AI 正在生成..."
                    : "输入消息...（Enter 发送，Shift+Enter 换行）"
              }
              rows={1}
              className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-300"
            />
            {streaming ? (
              <button
                onClick={stopStreaming}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-white hover:bg-neutral-700"
                title="停止生成"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!text.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400"
                title="发送"
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 弹窗 */}
      <BranchDialog
        open={branchDialogFor !== null}
        parentNodeId={branchDialogFor ?? ""}
        onClose={() => setBranchDialogFor(null)}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** 输入框最大高度（与 className 的 max-h-40 保持一致：40 * 4px = 160px） */
const TEXTAREA_MAX_HEIGHT = 160;

/**
 * 输入框随内容自适应高度：
 * - 内容少 → 单行（min-h-[38px]）
 * - 内容多 → 逐行增高，直到 TEXTAREA_MAX_HEIGHT
 * - 超过上限 → 停在最大高度，内部出现滚动条
 * - 删字/发送清空后 → 自动缩回
 *
 * 容器宽度变化（侧栏开合等）会改变换行行数，用 ResizeObserver 按宽度变化重算；
 * 只比较宽度，避免「改高度 → 触发 observer → 再改高度」的死循环。
 */
function useAutoGrowTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  const adjust = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 先把高度复位，才能量出当前内容的真实高度（否则 scrollHeight 会被旧高度撑住）
    el.style.height = "auto";
    const needed = el.scrollHeight;
    el.style.height = `${Math.min(needed, TEXTAREA_MAX_HEIGHT)}px`;
    // 未超上限时隐藏滚动条，超出后交给内部滚动
    el.style.overflowY = needed > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [ref]);

  useLayoutEffect(() => {
    adjust();
  }, [adjust, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.parentElement ?? el;
    let lastWidth = target.getBoundingClientRect().width;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const width = target.getBoundingClientRect().width;
      if (Math.abs(width - lastWidth) < 0.5) return;
      lastWidth = width;
      adjust();
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [adjust, ref]);
}

function ToolButton({
  icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
    >
      {icon}
      {label}
    </button>
  );
}

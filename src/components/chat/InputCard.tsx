/**
 * 圆角输入卡片：操作栏（分支切换/分叉/上级/新建/设置）+ 输入框 + 发送
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Plus,
  Send,
  Settings,
  Sparkles,
  Square,
} from "lucide-react";
import { useChatStore, type BranchOption } from "../../store/chatStore";
import { BranchDialog } from "../modals/BranchDialog";
import { NewStartDialog } from "../modals/NewStartDialog";
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

  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [children, setChildren] = useState<BranchOption[]>([]);
  const [branchDialogFor, setBranchDialogFor] = useState<string | null>(null);
  const [newStartOpen, setNewStartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载当前节点的子分支（下拉切换用）
  useEffect(() => {
    if (!repos || !currentNodeId) {
      setChildren([]);
      return;
    }
    let cancelled = false;
    repos.nodes.getChildrenWithEdge(currentNodeId).then((cs) => {
      if (cancelled) return;
      setChildren(
        cs.map((c) => ({
          nodeId: c.node.id,
          label: c.node.summary || c.node.question.slice(0, 12) || "未命名",
          color: c.node.color,
          relationType: c.edge.relationType,
          isCurrent: false,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [repos, currentNodeId]);

  const handleSend = () => {
    if (!text.trim() || streaming || preparing) return;
    sendMessage(text);
    setText("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
                onClick={() => setMenuOpen(!menuOpen)}
                title="切换分支"
              >
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-neutral-500" />
                <span className="truncate">
                  {currentNodeId ? "当前分支" : "未开始"}
                </span>
                <ChevronDown size={12} className="shrink-0 text-neutral-400" />
              </button>
              {menuOpen && (
                <div className="absolute bottom-full left-0 z-40 mb-1 w-52 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
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
              title="返回上级"
              disabled={!hasParent}
              onClick={() => navigateToParent()}
            />
            <ToolButton
              icon={<Sparkles size={13} />}
              label="新建"
              title="从新开始（不继承上下文）"
              disabled={!currentNodeId}
              onClick={() => setNewStartOpen(true)}
            />

            <div className="flex-1" />

            <button
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              title="AI 设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={14} />
            </button>
          </div>

          {/* 输入区 */}
          <div className="flex items-end gap-2 px-3 pb-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
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
      <NewStartDialog
        open={newStartOpen}
        onClose={() => setNewStartOpen(false)}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
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

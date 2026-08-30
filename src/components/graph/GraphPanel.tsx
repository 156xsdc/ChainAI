/**
 * 树状图面板：位于聊天区左侧，可拖动调整宽度
 * 顶部含树管理（切换/新建/重命名/删除）
 */
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  LayoutTemplate,
  Maximize2,
  Pencil,
  Plus,
  Trash2,
  TreePine,
  X,
} from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { useGraphStore } from "../../store/graphStore";
import { useClickOutside } from "../../hooks/useClickOutside";
import { confirmDialog, promptDialog } from "../../store/dialogStore";
import { GraphCanvas } from "./GraphCanvas";

const MIN_W = 260;
const MAX_W = 640;

export function GraphPanel() {
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);
  const setGraphFullscreen = useUIStore((s) => s.setGraphFullscreen);
  const leftPanelWidth = useUIStore((s) => s.leftPanelWidth);
  const setLeftPanelWidth = useUIStore((s) => s.setLeftPanelWidth);
  const resetLayout = useGraphStore((s) => s.resetLayout);
  const clearAllChat = useChatStore((s) => s.clearAllChat);
  const trees = useChatStore((s) => s.trees);
  const currentTreeId = useChatStore((s) => s.currentTreeId);
  const createTree = useChatStore((s) => s.createTree);
  const renameTree = useChatStore((s) => s.renameTree);
  const deleteTree = useChatStore((s) => s.deleteTree);
  const switchTree = useChatStore((s) => s.switchTree);
  const widthRef = useRef(leftPanelWidth);
  const dragging = useRef(false);
  const loadedWidth = useRef(false);
  const [treeMenuOpen, setTreeMenuOpen] = useState(false);
  const treeMenuRef = useClickOutside<HTMLDivElement>(
    () => setTreeMenuOpen(false),
    treeMenuOpen
  );

  useEffect(() => {
    widthRef.current = leftPanelWidth;
  }, [leftPanelWidth]);

  // 初始化：读取持久化的共享宽度（仅一次）
  useEffect(() => {
    if (loadedWidth.current) return;
    loadedWidth.current = true;
    void useChatStore
      .getState()
      .repos?.settings.get<number>("layout.leftPanelWidth", 380)
      .then((w) => setLeftPanelWidth(w));
  }, [setLeftPanelWidth]);

  const currentTree = trees.find((t) => t.id === currentTreeId);

  /** 新建树 */
  const handleCreateTree = async () => {
    const name = await promptDialog({
      title: "新建树",
      placeholder: "树名称（如：网站性能优化项目）",
    });
    if (name === null) return;
    await createTree(name);
    setTreeMenuOpen(false);
  };

  /** 重命名当前树 */
  const handleRenameTree = async () => {
    if (!currentTree) return;
    const name = await promptDialog({
      title: "重命名树",
      defaultValue: currentTree.name,
    });
    if (name === null) return;
    await renameTree(currentTree.id, name);
    setTreeMenuOpen(false);
  };

  /** 删除树 */
  const handleDeleteTree = async () => {
    if (!currentTree) return;
    const ok = await confirmDialog({
      title: "删除树",
      message: `确定删除树「${currentTree.name}」？\n其下所有对话将移入回收站（30天内可恢复）。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok) {
      await deleteTree(currentTree.id);
      setTreeMenuOpen(false);
    }
  };

  const handleClearAll = async () => {
    const ok = await confirmDialog({
      title: "清空全部对话",
      message:
        "确定清空全部对话吗？\n\n所有节点和消息将移入回收站（30天内可恢复），会话记录一并清空。",
      confirmText: "清空",
      danger: true,
    });
    if (ok) void clearAllChat();
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = leftPanelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)));
      setLeftPanelWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // 持久化共享宽度（收藏面板同时生效）
      useChatStore
        .getState()
        .repos?.settings.set("layout.leftPanelWidth", widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-neutral-200 bg-white"
      style={{ width: leftPanelWidth }}
    >
      {/* 标题栏：树管理 + 操作 */}
      <div className="relative flex items-center justify-between border-b border-neutral-100 px-2 py-1.5">
        {/* 当前树 + 树管理菜单 */}
        <div className="relative">
          <button
            className="flex max-w-[180px] items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
            onClick={() => setTreeMenuOpen(!treeMenuOpen)}
            title="切换树 / 管理树"
          >
            <TreePine size={12} className="shrink-0 text-neutral-400" />
            <span className="truncate">{currentTree?.name ?? "树"}</span>
            <ChevronDown size={11} className="shrink-0 text-neutral-400" />
          </button>

          {treeMenuOpen && (
            <div
              ref={treeMenuRef}
              className="absolute left-0 top-full z-40 mt-1 w-52 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
            >
              <div className="px-3 py-1 text-[10px] text-neutral-400">切换树</div>
              {trees.map((t) => (
                <div key={t.id} className="flex items-center">
                  <button
                    className={`min-w-0 flex-1 px-3 py-1.5 text-left text-xs hover:bg-neutral-100 ${
                      t.id === currentTreeId
                        ? "font-medium text-neutral-800"
                        : "text-neutral-600"
                    }`}
                    onClick={() => {
                      void switchTree(t.id);
                      setTreeMenuOpen(false);
                    }}
                  >
                    {t.name}
                  </button>
                  {t.id === currentTreeId && (
                    <button
                      className="mr-1 rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-700"
                      title="重命名"
                      onClick={() => void handleRenameTree()}
                    >
                      <Pencil size={10} />
                    </button>
                  )}
                </div>
              ))}
              <div className="my-1 h-px bg-neutral-100" />
              <button
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100"
                onClick={() => void handleCreateTree()}
              >
                <Plus size={12} /> 新建树
              </button>
              {currentTree && (
                <button
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
                  onClick={() => void handleDeleteTree()}
                >
                  <Trash2 size={12} /> 删除当前树
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            title="恢复自动布局"
            onClick={() => resetLayout()}
          >
            <LayoutTemplate size={13} />
          </button>
          <button
            className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
            title="清空当前树对话"
            onClick={handleClearAll}
          >
            <Trash2 size={13} />
          </button>
          <button
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            title="全屏 (Ctrl+Shift+F)"
            onClick={() => setGraphFullscreen(true)}
          >
            <Maximize2 size={13} />
          </button>
          <button
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            title="关闭"
            onClick={() => setLeftPanel(null)}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 画布 */}
      <div className="min-h-0 flex-1">
        <GraphCanvas />
      </div>

      {/* 拖拽调整宽度手柄 */}
      <div
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-neutral-300/70 active:bg-neutral-400"
        onMouseDown={startDrag}
      />
    </div>
  );
}

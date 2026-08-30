/**
 * 收藏面板：窄栏⭐按钮弹出的纯收藏面板
 * 宽度与树状图面板共享（拖动互通，持久化）
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { FavoritesSection } from "./FavoritesSection";

const MIN_W = 220;
const MAX_W = 640;

export function FavoritesPanel() {
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);
  const leftPanelWidth = useUIStore((s) => s.leftPanelWidth);
  const setLeftPanelWidth = useUIStore((s) => s.setLeftPanelWidth);
  const widthRef = useRef(leftPanelWidth);
  const dragging = useRef(false);
  const loadedWidth = useRef(false);

  useEffect(() => {
    widthRef.current = leftPanelWidth;
  }, [leftPanelWidth]);

  // 初始化：读取持久化的共享宽度（仅一次，与树状图面板保持一致）
  useEffect(() => {
    if (loadedWidth.current) return;
    loadedWidth.current = true;
    void useChatStore
      .getState()
      .repos?.settings.get<number>("layout.leftPanelWidth", 380)
      .then((w) => setLeftPanelWidth(w));
  }, [setLeftPanelWidth]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = leftPanelWidth;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)));
      widthRef.current = next; // 同步 ref，避免 mouseup 时读到滞后值
      setLeftPanelWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      useChatStore
        .getState()
        .repos?.settings.set("layout.leftPanelWidth", widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-neutral-200 bg-white"
      style={{ width: leftPanelWidth }}
    >
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-[11px] font-medium text-neutral-500">⭐ 收藏夹</span>
        <button
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          title="关闭"
          onClick={() => setLeftPanel(null)}
        >
          <X size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <FavoritesSection />
      </div>

      {/* 拖拽调整宽度手柄（与树状图共享宽度） */}
      <div
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-neutral-300/70 active:bg-neutral-400"
        onMouseDown={startDrag}
        title="拖拽调整宽度"
      />
    </aside>
  );
}

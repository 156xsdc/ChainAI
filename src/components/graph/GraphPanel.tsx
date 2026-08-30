/**
 * 树状图面板：位于聊天区左侧，可拖动调整宽度
 */
import { useRef, useState } from "react";
import { LayoutTemplate, Maximize2, Trash2, X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { useGraphStore } from "../../store/graphStore";
import { GraphCanvas } from "./GraphCanvas";

const MIN_W = 260;
const MAX_W = 640;

export function GraphPanel() {
  const setGraphOpen = useUIStore((s) => s.setGraphOpen);
  const setGraphFullscreen = useUIStore((s) => s.setGraphFullscreen);
  const resetLayout = useGraphStore((s) => s.resetLayout);
  const clearAllChat = useChatStore((s) => s.clearAllChat);
  const [width, setWidth] = useState(380);
  const dragging = useRef(false);

  const handleClearAll = () => {
    if (
      window.confirm(
        "确定清空全部对话吗？\n\n所有节点和消息将移入回收站（30天内可恢复），会话记录一并清空。"
      )
    ) {
      void clearAllChat();
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-neutral-200 bg-white"
      style={{ width }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-[11px] font-medium text-neutral-500">
          🌳 树状图
        </span>
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
            title="清空全部对话"
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
            onClick={() => setGraphOpen(false)}
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

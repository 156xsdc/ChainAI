/**
 * 左侧边栏（完全展开 250px）
 * 上半：树状图缩略图（占位）｜中部：收藏夹｜底部：设置 + 收起
 */
import { useEffect, useRef, useState } from "react";
import { ChevronsLeft, TreePine } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { TreeThumbnail } from "../graph/TreeThumbnail";
import { FavoritesSection } from "./FavoritesSection";

const MIN_W = 200;
const MAX_W = 420;

export function LeftSidebar() {
  const setSidebar = useUIStore((s) => s.setSidebar);
  const setGraphOpen = useUIStore((s) => s.setGraphOpen);
  const graphOpen = useUIStore((s) => s.graphOpen);
  const repos = useChatStore((s) => s.repos);
  const [width, setWidth] = useState(250);
  const widthRef = useRef(width);
  const dragging = useRef(false);

  // 恢复保存的宽度
  useEffect(() => {
    if (!repos) return;
    void repos.settings
      .get<number>("layout.leftWidth", 250)
      .then((w) => setWidth(w));
  }, [repos]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // 持久化最终宽度
      useChatStore
        .getState()
        .repos?.settings.set("layout.leftWidth", widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-neutral-200 bg-white"
      style={{ width }}
    >
      {/* 树状图缩略图区：实时预览 + 点击在聊天区左侧展开 */}
      <div className="flex min-h-0 flex-[3] flex-col border-b border-neutral-100 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <TreePine size={12} /> 树状图
          <span className="ml-auto text-[9px] text-neutral-300">
            {graphOpen ? "已展开" : "点击预览展开"}
          </span>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-hidden rounded-xl border ${
            graphOpen
              ? "border-neutral-400 bg-neutral-50"
              : "border-neutral-200 bg-neutral-50/60"
          }`}
        >
          {/* 点击展开树状图，同时自动收起侧边栏 */}
          <TreeThumbnail
            onClick={() => {
              setGraphOpen(true);
              setSidebar("left", false);
            }}
          />
        </div>
      </div>

      {/* 收藏夹（分组管理） */}
      <FavoritesSection />

      {/* 底部：收起（设置入口在输入卡片上方 ⚙） */}
      <div className="flex items-center justify-end border-t border-neutral-100 p-2">
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          onClick={() => setSidebar("left", false)}
          title="收起 (Ctrl+B)"
        >
          <ChevronsLeft size={13} /> 收起
        </button>
      </div>

      {/* 拖拽调整宽度手柄 */}
      <div
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-neutral-300/70 active:bg-neutral-400"
        onMouseDown={startDrag}
        title="拖拽调整宽度"
      />
    </aside>
  );
}

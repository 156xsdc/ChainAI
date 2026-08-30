/**
 * 左侧边栏（完全展开 250px）
 * 上半：树状图缩略图（占位）｜中部：收藏夹｜底部：设置 + 收起
 */
import { useState } from "react";
import { ChevronsLeft, Settings, TreePine } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { SettingsDialog } from "../modals/SettingsDialog";
import { TreeThumbnail } from "../graph/TreeThumbnail";
import { FavoritesSection } from "./FavoritesSection";

export function LeftSidebar() {
  const setSidebar = useUIStore((s) => s.setSidebar);
  const setGraphOpen = useUIStore((s) => s.setGraphOpen);
  const graphOpen = useUIStore((s) => s.graphOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-neutral-200 bg-white">
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
          <TreeThumbnail onClick={() => setGraphOpen(true)} />
        </div>
      </div>

      {/* 收藏夹（分组管理） */}
      <FavoritesSection />

      {/* 底部：设置 + 收起 */}
      <div className="flex items-center justify-between border-t border-neutral-100 p-2">
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={13} /> 设置
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          onClick={() => setSidebar("left", false)}
          title="收起 (Ctrl+B)"
        >
          <ChevronsLeft size={13} />
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

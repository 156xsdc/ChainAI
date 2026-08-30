/**
 * 收藏面板：窄栏⭐按钮弹出的纯收藏面板
 */
import { X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { FavoritesSection } from "./FavoritesSection";

export function FavoritesPanel() {
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-neutral-200 bg-white">
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
    </aside>
  );
}

/**
 * 树状图全屏模式：占据整个窗口，仅操作树状图
 */
import { Minimize2 } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { GraphCanvas } from "./GraphCanvas";

export function GraphFullscreen() {
  const fullscreen = useUIStore((s) => s.graphFullscreen);
  const setFullscreen = useUIStore((s) => s.setGraphFullscreen);

  if (!fullscreen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
        <span className="text-xs font-medium text-neutral-500">🌳 树状图 · 全屏</span>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
          onClick={() => setFullscreen(false)}
        >
          <Minimize2 size={13} />
          退出全屏 (Esc)
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <GraphCanvas fullscreen />
      </div>
    </div>
  );
}

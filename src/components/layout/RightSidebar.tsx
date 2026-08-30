/**
 * 右侧便签板（完全展开）
 * 占位：便签列表即将接入（便签文件存储机制）
 */
import { ChevronsRight, StickyNote } from "lucide-react";
import { useUIStore } from "../../store/uiStore";

export function RightSidebar() {
  const setSidebar = useUIStore((s) => s.setSidebar);

  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <StickyNote size={12} /> 便签板
        </div>
        <button
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          onClick={() => setSidebar("right", false)}
          title="收起 (Ctrl+Shift+N)"
        >
          <ChevronsRight size={13} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <StickyNote size={28} strokeWidth={1} className="text-neutral-200" />
        <div className="text-xs text-neutral-300">
          便签板即将上线
          <br />
          （便签将以 Markdown 文件存储）
        </div>
      </div>
    </aside>
  );
}

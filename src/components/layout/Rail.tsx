/**
 * 极窄侧栏（约20px），延伸至窗口底部，仅底部一个展开按钮
 */
import { Menu } from "lucide-react";
import { useUIStore } from "../../store/uiStore";

interface RailProps {
  side: "left" | "right";
}

export function Rail({ side }: RailProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isLeft = side === "left";

  return (
    <div
      className={`flex w-[20px] shrink-0 flex-col items-center border-neutral-200 bg-neutral-50 ${
        isLeft ? "border-r" : "border-l"
      }`}
    >
      {/* 顶部占位，按钮固定在底部 */}
      <div className="flex-1" />
      <button
        title={isLeft ? "展开侧边栏 (Ctrl+B)" : "展开便签板 (Ctrl+Shift+N)"}
        className="mb-1 rounded-md p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
        onClick={() => toggleSidebar(side)}
      >
        <Menu size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

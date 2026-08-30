/**
 * 极窄栏（40px）
 * - 左侧：图标工具栏（树状图 / 收藏，点击弹出对应面板，互斥）
 * - 右侧：便签板展开按钮
 */
import { Star, StickyNote, TreePine } from "lucide-react";
import { useUIStore } from "../../store/uiStore";

interface RailProps {
  side: "left" | "right";
}

export function Rail({ side }: RailProps) {
  const setSidebar = useUIStore((s) => s.setSidebar);
  const leftPanel = useUIStore((s) => s.leftPanel);
  const rightExpanded = useUIStore((s) => s.rightExpanded);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);
  const isLeft = side === "left";

  if (isLeft) {
    return (
      <div className="flex w-[40px] shrink-0 flex-col items-center border-r border-neutral-200 bg-neutral-50">
        {/* 图标工具栏：置于最上方 */}
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <RailIcon
            icon={<TreePine size={16} strokeWidth={1.6} />}
            title="树状图"
            active={leftPanel === "graph"}
            onClick={() => toggleLeftPanel("graph")}
          />
          <RailIcon
            icon={<Star size={16} strokeWidth={1.6} />}
            title="收藏"
            active={leftPanel === "favorites"}
            onClick={() => toggleLeftPanel("favorites")}
          />
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex w-[40px] shrink-0 flex-col items-center border-l border-neutral-200 bg-neutral-50">
      {/* 便签板按钮：置于最上方 */}
      <div className="mt-2">
        <RailIcon
          icon={<StickyNote size={16} strokeWidth={1.6} />}
          title="便签板 (Ctrl+Shift+N)"
          active={rightExpanded}
          onClick={() => setSidebar("right", !rightExpanded)}
        />
      </div>
      <div className="flex-1" />
    </div>
  );
}

function RailIcon({
  icon,
  title,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-2 transition-colors ${
        active
          ? "bg-neutral-800 text-white"
          : "text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
      }`}
    >
      {icon}
    </button>
  );
}

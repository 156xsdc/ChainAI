/**
 * 分叉提示线：仅在分叉点显示
 * 浅灰细线 + 小字，当前分支高亮，点击切换，+ 新建分支
 */
import { Plus } from "lucide-react";
import type { BranchOption } from "../../store/chatStore";

interface BranchDividerProps {
  children: BranchOption[];
  onSelect: (nodeId: string) => void;
  onAddBranch: (parentNodeId: string) => void;
  parentNodeId: string;
}

export function BranchDivider({
  children,
  onSelect,
  onAddBranch,
  parentNodeId,
}: BranchDividerProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-neutral-400 select-none">
      <div className="h-px flex-1 bg-neutral-200" />
      <span className="shrink-0 px-1">
        {children.length} 个分支
      </span>
      {children.map((b) => (
        <button
          key={b.nodeId}
          onClick={() => onSelect(b.nodeId)}
          title={b.relationType === "non_inherit" ? "新开始（不继承上下文）" : "点击切换到此分支"}
          className={`shrink-0 rounded-full border px-2 py-[1px] transition-colors ${
            b.isCurrent
              ? "border-neutral-500 bg-neutral-800 text-white"
              : "border-neutral-300 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
          }`}
        >
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: b.color }} />
          {b.label}
        </button>
      ))}
      <button
        onClick={() => onAddBranch(parentNodeId)}
        title="新建分支"
        className="shrink-0 rounded-full border border-dashed border-neutral-300 p-[2px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-700"
      >
        <Plus size={12} strokeWidth={2} />
      </button>
      <div className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

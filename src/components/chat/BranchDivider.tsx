/**
 * 分叉提示线：仅在分叉点显示
 * 浅灰细线 + 小字，当前分支高亮，点击切换
 * 每个分支可删除（hover 显示 ✕），右侧 + 新建分支
 */
import { memo } from "react";
import { Plus, X } from "lucide-react";
import type { BranchOption } from "../../store/chatStore";

interface BranchDividerProps {
  children: BranchOption[];
  onSelect: (nodeId: string) => void;
  onAddBranch: (parentNodeId: string) => void;
  onDeleteBranch: (nodeId: string, label: string) => void;
  parentNodeId: string;
}

export const BranchDivider = memo(function BranchDivider({
  children,
  onSelect,
  onAddBranch,
  onDeleteBranch,
  parentNodeId,
}: BranchDividerProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-neutral-400 select-none">
      <div className="h-px flex-1 bg-neutral-200" />
      <span className="shrink-0 px-1">{children.length} 个分支</span>

      {children.map((b) => (
        <span key={b.nodeId} className="group/chip relative shrink-0">
          <button
            onClick={() => onSelect(b.nodeId)}
            title={b.relationType === "non_inherit" ? "新开始（不继承上下文）" : "点击切换到此分支"}
            className={`rounded-full border px-2 py-[1px] transition-colors ${
              b.isCurrent
                ? "border-neutral-500 bg-neutral-800 text-white"
                : "border-neutral-300 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
            }`}
          >
            <span
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: b.color }}
            />
            {b.label}
          </button>
          {/* 删除该分支（含子树） */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteBranch(b.nodeId, b.label);
            }}
            title="删除该分支（含其下所有对话）"
            className="absolute -right-1 -top-1.5 z-10 hidden h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-400 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 group-hover/chip:flex"
          >
            <X size={8} strokeWidth={3} />
          </button>
        </span>
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
});

/**
 * 合并提示线：合并节点的来源父链选择
 * - 显示"由 N 条父链合并"，点击任意父链可跳回合并前的分支
 * - 与分支提示线（BranchDivider）同风格
 */
import { memo } from "react";
import { GitMerge } from "lucide-react";
import type { BranchOption } from "../../store/chatStore";

interface MergeDividerProps {
  /** 父链选项 */
  options: BranchOption[];
  onSelect: (nodeId: string) => void;
}

export const MergeDivider = memo(function MergeDivider({
  options,
  onSelect,
}: MergeDividerProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-neutral-400 select-none">
      <div className="h-px flex-1 bg-neutral-200" />
      <span className="flex shrink-0 items-center gap-1 px-1 text-neutral-400">
        <GitMerge size={11} />
        由 {options.length} 条父链合并（点击返回）
      </span>

      {options.map((b) => (
        <button
          key={b.nodeId}
          onClick={() => onSelect(b.nodeId)}
          title={
            b.relationType === "non_inherit"
              ? "新开始（不继承上下文）"
              : `父链：${b.label}`
          }
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-2 py-[1px] text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: b.color }}
          />
          {b.label}
        </button>
      ))}

      <div className="h-px flex-1 bg-neutral-200" />
    </div>
  );
});

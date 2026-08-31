/**
 * 树状图自定义节点：轻量圆点（与缩略图一致的表现形式）
 * - 平时只显示淡灰小点，悬停显示用户问题（tooltip）
 * - 当前节点：深色 + 细白描边；当前路径：灰白描边
 * - 新开始(淡棕) / 合并(淡紫) 微色区分，保持轻
 */
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { TreeNode } from "../../core/db";

export interface TreeNodeWidgetData {
  node: TreeNode;
  isCurrent: boolean;
  isOnPath: boolean;
  [key: string]: unknown; // React Flow Node 泛型约束需要索引签名
}

export type TreeNodeFlowNode = Node<TreeNodeWidgetData>;

export const NODE_W = 26;
export const NODE_H = 30;

export function TreeNodeWidget({ data }: NodeProps<TreeNodeFlowNode>) {
  const { node, isCurrent, isOnPath } = data;

  const baseColor =
    node.type === "new_start"
      ? "#c98d5a" // 淡棕
      : node.type === "merge"
        ? "#8d8dd6" // 淡紫
        : "#cfcfcf"; // 淡灰
  // 颜色永远表示类型（合并=淡紫 / 新开始=淡棕 / 普通=淡灰），
  // 状态用描边环区分：当前=深色粗环，路径=中环，其余无环
  const dotColor = baseColor;
  const dotSize = isCurrent ? 11 : isOnPath ? 9.5 : 8;
  const boxShadow = isCurrent
    ? "0 0 0 1.5px #ffffff, 0 0 0 3.5px #1a1a1a"
    : isOnPath
      ? "0 0 0 1px #ffffff, 0 0 0 2px rgba(26,26,26,0.4)"
      : undefined;

  return (
    <div className="group relative flex h-full w-full cursor-grab items-center justify-center active:cursor-grabbing">
      {/* 圆点 */}
      <div
        className="relative rounded-full transition-all duration-150"
        style={{
          width: dotSize,
          height: dotSize,
          background: dotColor,
          boxShadow,
        }}
      >
        {/* 角标：收藏 / 保留 */}
        {(node.isFavorited || node.isKept) && (
          <span className="absolute -right-2.5 -top-2 text-[8px] leading-none select-none">
            {node.isFavorited && "⭐"}
            {node.isKept && "📌"}
          </span>
        )}
      </div>

      {/* 悬停 tooltip：显示用户问题 */}
      <div className="pointer-events-none invisible absolute bottom-[calc(100%+10px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg group-hover:visible">
        <div className="max-w-[280px] overflow-hidden text-ellipsis text-[11px] text-neutral-700">
          {node.question || "（空节点）"}
        </div>
        {(node.type !== "normal" || node.isFavorited || node.isKept) && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400">
            {node.type === "new_start" && <span>✦ 新开始</span>}
            {node.type === "merge" && <span>◉ 合并</span>}
            {node.isFavorited && <span>⭐ 已收藏</span>}
            {node.isKept && <span>📌 已保留</span>}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} className="!h-0.5 !w-0.5 !border-0 !bg-transparent" />
      <Handle type="source" position={Position.Bottom} className="!h-0.5 !w-0.5 !border-0 !bg-transparent" />
    </div>
  );
}

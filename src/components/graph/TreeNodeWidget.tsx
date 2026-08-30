/**
 * 树状图自定义节点：Git 提交图风格的圆点
 * - 平时只显示圆点，悬停显示用户问题（tooltip）
 * - 类型区分：普通(灰) / 新开始(棕+✦) / 合并(紫+◉)
 * - 当前节点：深色 + 外环高亮；当前路径：深灰
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

/** 圆点尺寸：为 Handle 留出上下空间 */
export const NODE_W = 30;
export const NODE_H = 34;

export function TreeNodeWidget({ data }: NodeProps<TreeNodeFlowNode>) {
  const { node, isCurrent, isOnPath } = data;

  const baseColor =
    node.type === "new_start"
      ? "#b45309"
      : node.type === "merge"
        ? "#5b5bd6"
        : "#a8a8a8";
  const dotColor = isCurrent ? "#1a1a1a" : isOnPath ? "#525252" : baseColor;
  const dotSize = isCurrent ? 15 : isOnPath ? 13 : 10;

  return (
    <div className="group relative flex h-full w-full cursor-grab items-center justify-center active:cursor-grabbing">
      {/* 圆点 */}
      <div
        className="relative rounded-full transition-all duration-150"
        style={{
          width: dotSize,
          height: dotSize,
          background: dotColor,
          boxShadow: isCurrent
            ? "0 0 0 2px #ffffff, 0 0 0 4px #1a1a1a"
            : isOnPath
              ? "0 0 0 1px #ffffff"
              : undefined,
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

      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}

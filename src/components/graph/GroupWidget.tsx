/**
 * 节点分组：细虚线半透明框（轻量）
 * - 展开：组名/总结默认隐藏，hover 悬浮显示
 * - 折叠：半透明灰底 + 组名常驻（+数量）
 */
import { type Node, type NodeProps } from "@xyflow/react";
import type { NodeGroup } from "../../core/db";

export interface GroupWidgetData {
  group: NodeGroup;
  memberCount: number;
  collapsed: boolean;
  onToggle: (groupId: string) => void;
  onContextMenu: (e: React.MouseEvent, group: NodeGroup) => void;
  [key: string]: unknown;
}

export type GroupFlowNode = Node<GroupWidgetData>;

export function GroupWidget({ data }: NodeProps<GroupFlowNode>) {
  const { group, memberCount, collapsed, onToggle, onContextMenu } = data;

  return (
    <div
      className={`group absolute inset-0 rounded-lg border border-dashed transition-colors ${
        collapsed
          ? "bg-neutral-200/35 hover:bg-neutral-200/50"
          : "bg-transparent hover:bg-neutral-100/25"
      }`}
      style={{ borderColor: group.color || "#dcdcdc" }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(group.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, group);
      }}
      title={collapsed ? "点击展开分组" : "点击折叠分组"}
    >
      {/* 组名：折叠常驻，展开 hover 悬浮显示 */}
      <span
        className={`pointer-events-none absolute left-2 top-1 max-w-[calc(100%-16px)] truncate text-[9px] font-medium text-neutral-400 ${
          collapsed ? "" : "opacity-0 transition-opacity group-hover:opacity-100"
        }`}
      >
        {collapsed ? `▸ ${group.name || "未命名分组"} (${memberCount})` : group.name || "未命名分组"}
      </span>

      {/* 总结：hover 悬浮显示 */}
      {group.summary && (
        <span className="pointer-events-none absolute left-2 right-2 top-6 line-clamp-3 text-[9px] leading-4 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
          {group.summary}
        </span>
      )}
    </div>
  );
}

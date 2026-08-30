/**
 * 节点分组：虚线框包围 + 分组名 + 折叠/展开
 * 点击分组框切换折叠；右键打开分组菜单
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
      className={`absolute inset-0 rounded-xl border-2 border-dashed transition-colors ${
        collapsed ? "bg-neutral-100/70" : "bg-neutral-50/25 hover:bg-neutral-50/50"
      }`}
      style={{ borderColor: group.color || "#9a9a9a" }}
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
      <span
        className="pointer-events-none absolute left-3 top-1.5 flex items-center gap-1 text-[10px] font-medium"
        style={{ color: group.color || "#666" }}
      >
        {collapsed ? "▸" : "▾"} {group.name || "未命名分组"}
        {collapsed && <span className="text-neutral-400">({memberCount})</span>}
      </span>
    </div>
  );
}

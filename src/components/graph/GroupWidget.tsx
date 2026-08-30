/**
 * 节点分组：细虚线半透明框（轻量）
 * - 边框/色点/折叠背景均使用 group.color（颜色变化清晰可见）
 * - 展开：组名默认隐藏，hover 悬浮显示；折叠：组名常驻
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

/** HEX → rgba（淡色背景用；rgba 输入直接返回） */
function hexToRgba(color: string, alpha: number): string {
  const h = color.replace("#", "").trim();
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return `rgba(${parseInt(h[0] + h[0], 16)}, ${parseInt(h[1] + h[1], 16)}, ${parseInt(h[2] + h[2], 16)}, ${alpha})`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
  }
  return color;
}

export function GroupWidget({ data }: NodeProps<GroupFlowNode>) {
  const { group, memberCount, collapsed, onToggle, onContextMenu } = data;
  const color = group.color || "#dcdcdc";
  // 展开：淡色底（12%透明度，轻但有区分度）；折叠：稍深（28%）
  const openBg = hexToRgba(color, 0.12);
  const foldBg = hexToRgba(color, 0.28);

  return (
    <div
      className="group absolute inset-0 rounded-lg border border-dashed transition-colors"
      style={{
        borderColor: color,
        background: collapsed ? foldBg : openBg,
      }}
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
      {/* 组名（含颜色指示点）：折叠常驻，展开 hover 悬浮 */}
      <span
        className={`pointer-events-none absolute left-2 top-1 flex max-w-[calc(100%-16px)] items-center gap-1 text-[9px] font-medium ${
          collapsed ? "text-neutral-500" : "text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100"
        }`}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate">
          {collapsed ? `${group.name || "未命名分组"} (${memberCount})` : group.name || "未命名分组"}
        </span>
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

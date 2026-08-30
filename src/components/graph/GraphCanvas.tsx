/**
 * React Flow 画布：Git 风格树状图 + 节点分组（虚线框）
 * - 实线 = 继承，虚线 = 新开始
 * - 点击节点跳转聊天区；拖拽节点到另一节点触发合并
 * - 框选（左键拖空白）→ 创建分组
 * - 分组：虚线框 + 点击折叠/展开 + 右键菜单
 */
import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  getNodesBounds,
  getViewportForBounds,
  type Edge,
  type NodeTypes,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import "@xyflow/react/dist/style.css";
import { useChatStore } from "../../store/chatStore";
import { useGraphStore } from "../../store/graphStore";
import { useGraphData } from "./useGraphData";
import { summarizeNodeGroup } from "../../core/context/aiSummarizer";
import { savePngFile } from "../../core/io/files";
import { MergeDialog } from "../modals/MergeDialog";
import { GraphNodeMenu } from "./GraphNodeMenu";
import {
  NODE_H,
  NODE_W,
  TreeNodeWidget,
  type TreeNodeFlowNode,
} from "./TreeNodeWidget";
import { GroupWidget, type GroupFlowNode } from "./GroupWidget";
import type { NodeGroup } from "../../core/db";

const nodeTypes: NodeTypes = { tree: TreeNodeWidget, group: GroupWidget };

/** 拖拽合并触发距离 */
const MERGE_DISTANCE = 70;
/** 分组框内边距 */
const GROUP_PAD = 26;

export function GraphCanvas({ fullscreen = false }: { fullscreen?: boolean }) {
  const data = useGraphData();
  const navigateTo = useChatStore((s) => s.navigateTo);
  const repos = useChatStore((s) => s.repos);
  const setUiError = useChatStore((s) => s.setUiError);
  const setNotice = useChatStore((s) => s.setNotice);
  const manualPositions = useGraphStore((s) => s.manualPositions);
  const setManualPosition = useGraphStore((s) => s.setManualPosition);
  const loadPositions = useGraphStore((s) => s.loadPositions);
  const bumpGraphVersion = useGraphStore((s) => s.bumpGraphVersion);
  const rfRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCurrent = useRef<string | null>(null);
  const positionsLoaded = useRef(false);
  const [mergeState, setMergeState] = useState<{
    sourceId: string;
    targetId: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupMenu, setGroupMenu] = useState<{
    x: number;
    y: number;
    group: NodeGroup;
  } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  // 挂载时加载持久化的手动位置
  useEffect(() => {
    if (positionsLoaded.current || !repos) return;
    positionsLoaded.current = true;
    repos.settings
      .get<Record<string, { x: number; y: number }>>("graph.manualPositions", {})
      .then((p) => loadPositions(p ?? {}))
      .catch(() => {});
  }, [repos, loadPositions]);

  // 当前节点变化 → 画布定位
  useEffect(() => {
    if (!data?.currentId || !data.layout) return;
    if (prevCurrent.current === data.currentId) return;
    prevCurrent.current = data.currentId;
    const pos = data.layout.positions.get(data.currentId);
    if (pos) {
      rfRef.current?.setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, {
        zoom: 1.2,
        duration: 350,
      });
    }
  }, [data]);

  /** 获取节点显示位置（手动优先） */
  const nodePos = (id: string) => {
    const manual = manualPositions[id];
    const algo = data?.layout.positions.get(id);
    return manual ?? { x: algo?.x ?? 0, y: algo?.y ?? 0 };
  };

  // ---- 拖拽合并 ----
  const handleNodeDragStop: OnNodeDrag<FlowNode> = (_, node) => {
    const inst = rfRef.current;
    if (!inst) return;
    const intersecting = inst.getIntersectingNodes(node);
    const target = intersecting.find((n) => n.id !== node.id) ?? intersecting[0];
    const distance = target
      ? Math.hypot(
          (target.position.x ?? 0) +
            (target.width ?? NODE_W) / 2 -
            (node.position.x ?? 0) -
            NODE_W / 2,
          (target.position.y ?? 0) +
            (target.height ?? NODE_H) / 2 -
            (node.position.y ?? 0) -
            NODE_H / 2
        )
      : Infinity;
    if (target && distance < MERGE_DISTANCE) {
      void handleMergeRequest(node.id, target.id);
    } else {
      setManualPosition(node.id, {
        x: node.position.x,
        y: node.position.y,
      });
    }
  };

  const handleMergeRequest = async (sourceId: string, targetId: string) => {
    if (!repos) return;
    const [sourceDesc, targetDesc] = await Promise.all([
      repos.nodes.getDescendantIds(sourceId),
      repos.nodes.getDescendantIds(targetId),
    ]);
    if (sourceDesc.includes(targetId) || targetDesc.includes(sourceId)) {
      setUiError("不能合并有上下级关系的节点（会形成循环）");
      return;
    }
    setMergeState({ sourceId, targetId });
  };

  // ---- 分组操作 ----
  const toggleGroup = async (groupId: string) => {
    if (!repos || !data) return;
    const g = data.groups.find((x) => x.group.id === groupId);
    if (!g) return;
    await repos.groups.updateGroup(groupId, { collapsed: !g.group.collapsed });
    bumpGraphVersion();
  };

  const handleCreateGroup = async () => {
    if (!repos || selectedIds.size === 0) return;
    const name = window.prompt("分组名称", "新分组");
    if (name === null) return;
    const g = await repos.groups.createGroup({ name: name.trim() || "未命名分组" });
    await repos.groups.addMembers(g.id, [...selectedIds]);
    setSelectedIds(new Set());
    setNotice(`📦 已创建分组「${g.name}」`);
    bumpGraphVersion();
  };

  const renameGroup = async (group: NodeGroup) => {
    const name = window.prompt("重命名分组", group.name);
    if (name === null) return;
    await repos?.groups.updateGroup(group.id, { name: name.trim() });
    bumpGraphVersion();
  };

  const recolorGroup = async (group: NodeGroup) => {
    const color = window.prompt("分组颜色（HEX，如 #5b5bd6）", group.color);
    if (color === null) return;
    await repos?.groups.updateGroup(group.id, { color: color.trim() });
    bumpGraphVersion();
  };

  const deleteGroup = async (group: NodeGroup) => {
    if (!window.confirm(`删除分组「${group.name}」？（节点不会被删除）`)) return;
    await repos?.groups.deleteGroup(group.id);
    setNotice("🗑️ 已删除分组");
    bumpGraphVersion();
  };

  const aiSummarizeGroup = async (group: NodeGroup) => {
    if (!repos || !data) return;
    setNotice("🤖 正在生成分组总结...");
    const memberIds =
      data.groups.find((g) => g.group.id === group.id)?.memberIds ?? [];
    const summary = await summarizeNodeGroup(repos, memberIds);
    if (summary) {
      await repos.groups.updateGroup(group.id, { summary });
      setNotice("✅ 已生成分组总结（折叠分组可查看）");
      bumpGraphVersion();
    } else {
      setUiError("总结生成失败：请检查 AI 配置后重试");
    }
    setGroupMenu(null);
  };

  const editGroupSummary = async (group: NodeGroup) => {
    if (!repos) return;
    const text = window.prompt("分组总结（手动编辑）", group.summary);
    if (text === null) return;
    await repos.groups.updateGroup(group.id, { summary: text.trim() });
    bumpGraphVersion();
  };

  /** 导出画布为 PNG（html-to-image） */
  const exportPng = async () => {
    if (!containerRef.current) return;
    try {
      const allNodes = [...groupNodes, ...rfNodes];
      const nodesBounds = getNodesBounds(allNodes);
      const imageWidth = 1280;
      const imageHeight = 960;
      const viewport = getViewportForBounds(
        nodesBounds,
        imageWidth,
        imageHeight,
        0.5,
        2,
        0.1
      );
      const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
      const dataUrl = await toPng(containerRef.current, {
        backgroundColor: "#fafafa",
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform,
        },
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      const name = `chainai-graph-${new Date().toISOString().slice(0, 10)}.png`;
      const saved = await savePngFile(name, base64);
      if (saved) setNotice(`✅ 已导出 PNG：${saved}`);
    } catch (err) {
      setUiError(`导出 PNG 失败：${(err as Error).message}`);
    }
  };

  // ---- 数据组装 ----
  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-300">
        暂无对话节点
        <br />
        （在聊天区开始对话后，这里会显示树状结构）
      </div>
    );
  }

  const collapsedIds = new Set(
    data.groups.filter((g) => g.group.collapsed).flatMap((g) => g.memberIds)
  );

  const rfNodes: FlowNode[] = data.nodes
    .filter((n) => !collapsedIds.has(n.id))
    .map((n) => {
      const pos = nodePos(n.id);
      return {
        id: n.id,
        type: "tree",
        position: { x: pos.x, y: pos.y },
        width: NODE_W,
        height: NODE_H,
        data: {
          node: n,
          isCurrent: n.id === data.currentId,
          isOnPath: data.pathIds.has(n.id),
        },
      };
    });

  // 分组虚线框节点（在成员下方）
  const groupNodes: GroupFlowNode[] = data.groups
    .filter((g) => g.memberIds.length > 0)
    .map((g) => {
      const positions = g.memberIds.map(nodePos);
      const minX = Math.min(...positions.map((p) => p.x)) - GROUP_PAD;
      const minY = Math.min(...positions.map((p) => p.y)) - GROUP_PAD;
      const maxX = Math.max(...positions.map((p) => p.x + NODE_W)) + GROUP_PAD;
      const maxY = Math.max(...positions.map((p) => p.y + NODE_H)) + GROUP_PAD;
      return {
        id: `group-${g.group.id}`,
        type: "group" as const,
        position: { x: minX, y: minY },
        width: maxX - minX,
        height: maxY - minY,
        draggable: false,
        selectable: false,
        zIndex: -1,
        data: {
          group: g.group,
          memberCount: g.memberIds.length,
          collapsed: g.group.collapsed,
          onToggle: toggleGroup,
          onContextMenu: (e: React.MouseEvent, group: NodeGroup) => {
            setGroupMenu({ x: e.clientX, y: e.clientY, group });
          },
        },
      };
    });

  const rfEdges: Edge[] = data.edges
    .filter((e) => !collapsedIds.has(e.parentId) && !collapsedIds.has(e.childId))
    .map((e) => ({
      id: e.id,
      source: e.parentId,
      target: e.childId,
      type: "straight",
      style:
        e.relationType === "non_inherit"
          ? { stroke: "#c9c9c9", strokeDasharray: "5 4", strokeWidth: 1.2 }
          : { stroke: "#9a9a9a", strokeWidth: 1.2 },
    }));

  const handleSelectionChange: OnSelectionChangeFunc = (params) => {
    setSelectedIds(new Set(params.nodes.map((n) => n.id)));
  };

  return (
    <>
      <div ref={containerRef} className="relative h-full w-full">
        <ReactFlow
          nodes={[...groupNodes, ...rfNodes]}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onInit={(inst) => {
            rfRef.current = inst;
          }}
          onNodeClick={(_, node) => {
            if (node.type === "tree") navigateTo(node.id);
          }}
          onNodeContextMenu={(e, node) => {
            if (node.type !== "tree") return;
            e.preventDefault();
            setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
          }}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={() => {
            setNodeMenu(null);
            setGroupMenu(null);
          }}
          onSelectionChange={handleSelectionChange}
          nodesDraggable
          selectionOnDrag
          panOnDrag={[1, 2]}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          className="bg-[#fafafa]"
        >
          <Background color="#e5e5e5" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
          <button
            className="absolute bottom-3 right-3 z-10 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] text-neutral-500 shadow-sm hover:bg-neutral-100"
            onClick={() => void exportPng()}
            title="导出为 PNG 图片"
          >
            🖼 导出 PNG
          </button>
          {!fullscreen && (
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                if (n.type === "group") return "#e8e8e8";
                const d = (n.data as { isCurrent?: boolean }) ?? {};
                return d.isCurrent ? "#1a1a1a" : "#d4d4d4";
              }}
              maskColor="rgba(0,0,0,0.04)"
              className="!bg-white"
            />
          )}
        </ReactFlow>

        {/* 框选后的浮动操作条 */}
        {selectedIds.size > 0 && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 shadow-md">
            <span className="text-xs text-neutral-500">
              已选 {selectedIds.size} 个节点
            </span>
            <button
              className="rounded-lg bg-neutral-800 px-2.5 py-1 text-[11px] text-white hover:bg-neutral-700"
              onClick={() => void handleCreateGroup()}
            >
              📦 创建分组
            </button>
            <button
              className="rounded-lg px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-100"
              onClick={() => setSelectedIds(new Set())}
            >
              取消
            </button>
          </div>
        )}

        {/* 节点右键菜单 */}
        {nodeMenu && (
          <GraphNodeMenu
            x={nodeMenu.x}
            y={nodeMenu.y}
            nodeId={nodeMenu.nodeId}
            onClose={() => setNodeMenu(null)}
          />
        )}

        {/* 分组右键菜单 */}
        {groupMenu && (
          <div
            className="fixed z-50 w-40 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
            style={{ top: groupMenu.y, left: groupMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <GroupMenuItem label="重命名" onClick={() => renameGroup(groupMenu.group)} />
            <GroupMenuItem label="修改颜色" onClick={() => recolorGroup(groupMenu.group)} />
            <GroupMenuItem label="🤖 AI 总结" onClick={() => void aiSummarizeGroup(groupMenu.group)} />
            <GroupMenuItem label="编辑总结" onClick={() => editGroupSummary(groupMenu.group)} />
            <GroupMenuItem
              label={groupMenu.group.collapsed ? "展开分组" : "折叠分组"}
              onClick={() => toggleGroup(groupMenu.group.id)}
            />
            <div className="my-1 h-px bg-neutral-100" />
            <GroupMenuItem
              label="删除分组"
              danger
              onClick={() => deleteGroup(groupMenu.group)}
            />
          </div>
        )}
      </div>

      {/* 拖拽合并对话框 */}
      {mergeState && (
        <MergeDialog
          open
          sourceId={mergeState.sourceId}
          targetId={mergeState.targetId}
          onClose={() => {
            const src = rfRef.current?.getNode(mergeState.sourceId);
            if (src) {
              setManualPosition(src.id, {
                x: src.position.x,
                y: src.position.y,
              });
            }
            setMergeState(null);
          }}
        />
      )}
    </>
  );
}

function GroupMenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-neutral-100 ${
        danger ? "text-red-500" : "text-neutral-700"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type FlowNode = TreeNodeFlowNode | GroupFlowNode;

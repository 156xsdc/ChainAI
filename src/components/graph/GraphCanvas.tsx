/**
 * React Flow 画布：Git 风格树状图
 * - 实线 = 继承，虚线 = 不继承（新开始）
 * - 点击节点 → 跳转聊天区
 * - 当前节点/路径高亮，自动定位
 */
import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type NodeTypes,
  type OnNodeDrag,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useChatStore } from "../../store/chatStore";
import { useGraphStore } from "../../store/graphStore";
import { useGraphData } from "./useGraphData";
import { MergeDialog } from "../modals/MergeDialog";
import {
  NODE_H,
  NODE_W,
  TreeNodeWidget,
  type TreeNodeFlowNode,
} from "./TreeNodeWidget";

const nodeTypes: NodeTypes = { tree: TreeNodeWidget };

// 修正节点数组类型：data 泛型
type FlowNode = TreeNodeFlowNode;

/** 拖拽合并的触发距离（px） */
const MERGE_DISTANCE = 70;

export function GraphCanvas({ fullscreen = false }: { fullscreen?: boolean }) {
  const data = useGraphData();
  const navigateTo = useChatStore((s) => s.navigateTo);
  const repos = useChatStore((s) => s.repos);
  const setUiError = useChatStore((s) => s.setUiError);
  const manualPositions = useGraphStore((s) => s.manualPositions);
  const setManualPosition = useGraphStore((s) => s.setManualPosition);
  const loadPositions = useGraphStore((s) => s.loadPositions);
  const rfRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const prevCurrent = useRef<string | null>(null);
  const positionsLoaded = useRef(false);
  const [mergeState, setMergeState] = useState<{
    sourceId: string;
    targetId: string;
  } | null>(null);

  // 挂载时加载持久化的手动位置（仅一次）
  useEffect(() => {
    if (positionsLoaded.current || !repos) return;
    positionsLoaded.current = true;
    repos.settings
      .get<Record<string, { x: number; y: number }>>("graph.manualPositions", {})
      .then((p) => loadPositions(p ?? {}))
      .catch(() => {});
  }, [repos, loadPositions]);

  // 当前节点变化 → 画布定位到该节点
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

  /** 拖拽结束：命中目标 → 合并；否则自由放置并记住位置 */
  const handleNodeDragStop: OnNodeDrag<FlowNode> = (_, node) => {
    const inst = rfRef.current;
    if (!inst) return;
    const intersecting = inst.getIntersectingNodes(node);
    const target = intersecting.find((n) => n.id !== node.id) ?? intersecting[0];
    const distance = target
      ? Math.hypot(
          (target.position.x ?? 0) + (target.width ?? NODE_W) / 2 - (node.position.x ?? 0) - NODE_W / 2,
          (target.position.y ?? 0) + (target.height ?? NODE_H) / 2 - (node.position.y ?? 0) - NODE_H / 2
        )
      : Infinity;
    if (target && distance < MERGE_DISTANCE) {
      void handleMergeRequest(node.id, target.id);
    } else {
      // 自由放置：记住新位置（不弹回）
      setManualPosition(node.id, {
        x: node.position.x,
        y: node.position.y,
      });
    }
  };

  /** 合并请求：环检测后打开对话框 */
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

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-300">
        暂无对话节点
        <br />
        （在聊天区开始对话后，这里会显示树状结构）
      </div>
    );
  }

  const rfNodes: FlowNode[] = data.nodes.map((n) => {
    // 手动位置优先，其次算法布局
    const manual = manualPositions[n.id];
    const algo = data.layout.positions.get(n.id);
    return {
      id: n.id,
      type: "tree",
      position: manual ?? { x: algo?.x ?? 0, y: algo?.y ?? 0 },
      width: NODE_W,
      height: NODE_H,
      data: {
        node: n,
        isCurrent: n.id === data.currentId,
        isOnPath: data.pathIds.has(n.id),
      },
    };
  });

  // 与缩略图一致的直线风格：实线=继承，虚线=新开始
  const rfEdges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.parentId,
    target: e.childId,
    type: "straight",
    style:
      e.relationType === "non_inherit"
        ? { stroke: "#c9c9c9", strokeDasharray: "5 4", strokeWidth: 1.2 }
        : { stroke: "#9a9a9a", strokeWidth: 1.2 },
  }));

  return (
    <>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onInit={(inst) => {
          rfRef.current = inst;
        }}
        onNodeClick={(_, node) => navigateTo(node.id)}
        onNodeDragStop={handleNodeDragStop}
        nodesDraggable
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="bg-[#fafafa]"
      >
        <Background color="#e5e5e5" gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        {!fullscreen && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const d = (n.data as { isCurrent?: boolean }) ?? {};
              return d.isCurrent ? "#1a1a1a" : "#d4d4d4";
            }}
            maskColor="rgba(0,0,0,0.04)"
            className="!bg-white"
          />
        )}
      </ReactFlow>

      {/* 拖拽合并对话框：取消时保留源节点拖拽后的位置 */}
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

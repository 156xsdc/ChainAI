/**
 * 树状图缩略图（左侧边栏）
 * 轻量 SVG 渲染：圆点 + 直线连线，自动适配缩放
 * 交互：
 * - 点击圆点 → 聊天区跳转到该节点
 * - 拖拽圆点到另一圆点 → 综合合并（环检测 + 对话框）
 * - 点击空白 → 在聊天区左侧展开完整树状图
 */
import { useEffect, useRef, useState } from "react";
import { TreePine } from "lucide-react";
import { useGraphData } from "./useGraphData";
import { NODE_H, NODE_W } from "./TreeNodeWidget";
import { useChatStore } from "../../store/chatStore";
import { MergeDialog } from "../modals/MergeDialog";

/** SVG 坐标下的合并命中距离 */
const MERGE_THRESHOLD = 48;
/** 视为点击（而非拖拽）的最大位移（client px） */
const CLICK_SLOP = 5;

export function TreeThumbnail({ onClick }: { onClick: () => void }) {
  const data = useGraphData();
  const navigateTo = useChatStore((s) => s.navigateTo);
  const repos = useChatStore((s) => s.repos);
  const setUiError = useChatStore((s) => s.setUiError);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [drag, setDrag] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);
  const [mergeState, setMergeState] = useState<{
    sourceId: string;
    targetId: string;
  } | null>(null);

  /** client 坐标 → SVG 坐标 */
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const nodeCenter = (id: string) => ({
    x: (data?.layout.positions.get(id)?.x ?? 0) + NODE_W / 2,
    y: (data?.layout.positions.get(id)?.y ?? 0) + NODE_H / 2,
  });

  /** 找最近的圆点目标 */
  const findNearest = (p: { x: number; y: number }, excludeId: string) => {
    if (!data) return null;
    let best: { id: string; dist: number } | null = null;
    for (const n of data.nodes) {
      if (n.id === excludeId) continue;
      const c = nodeCenter(n.id);
      const dist = Math.hypot(c.x - p.x, c.y - p.y);
      if (dist < MERGE_THRESHOLD && (!best || dist < best.dist)) {
        best = { id: n.id, dist };
      }
    }
    return best;
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

  /** 圆点按下：开始拖拽（或点击） */
  const handlePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation(); // 阻止空白点击展开
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    const p = toSvgPoint(e.clientX, e.clientY);
    setDrag({ sourceId: nodeId, x: p.x, y: p.y });
  };

  // 拖拽过程：window 级监听，松手判定点击/合并
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const p = toSvgPoint(e.clientX, e.clientY);
      setDrag((d) => (d ? { ...d, x: p.x, y: p.y } : d));
    };

    const onUp = (e: PointerEvent) => {
      const start = dragStartRef.current;
      const moved = start
        ? Math.hypot(e.clientX - start.x, e.clientY - start.y)
        : 0;
      if (moved < CLICK_SLOP) {
        // 点击 → 跳转
        navigateTo(drag.sourceId);
      } else {
        // 拖拽 → 合并检测
        const p = toSvgPoint(e.clientX, e.clientY);
        const target = findNearest(p, drag.sourceId);
        if (target) void handleMergeRequest(drag.sourceId, target.id);
      }
      dragStartRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  if (!data || data.nodes.length === 0) {
    return (
      <button
        onClick={onClick}
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[10px] text-neutral-300 hover:text-neutral-500"
      >
        <TreePine size={20} strokeWidth={1} />
        暂无对话节点
      </button>
    );
  }

  const { nodes, edges, layout, currentId, pathIds } = data;

  return (
    <div
      className="relative h-full w-full cursor-default"
      onClick={onClick}
      title="点击空白展开树状图；点击圆点跳转；拖拽圆点合并"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        {/* 连线：实线=继承，虚线=新开始 */}
        {edges.map((e) => {
          const p = nodeCenter(e.parentId);
          const c = nodeCenter(e.childId);
          return (
            <line
              key={e.id}
              x1={p.x}
              y1={p.y}
              x2={c.x}
              y2={c.y}
              stroke={e.relationType === "non_inherit" ? "#c9c9c9" : "#9a9a9a"}
              strokeWidth={1}
              strokeDasharray={e.relationType === "non_inherit" ? "3 3" : undefined}
            />
          );
        })}

        {/* 圆点（含大热区，支持点击/拖拽） */}
        {nodes.map((n) => {
          const c = nodeCenter(n.id);
          const isCurrent = n.id === currentId;
          const isOnPath = pathIds.has(n.id);
          const base =
            n.type === "new_start"
              ? "#b45309"
              : n.type === "merge"
                ? "#5b5bd6"
                : "#a8a8a8";
          const color = isCurrent ? "#1a1a1a" : isOnPath ? "#525252" : base;
          const r = isCurrent ? 4.5 : isOnPath ? 3.5 : 2.8;
          return (
            <g
              key={n.id}
              onPointerDown={(e) => handlePointerDown(e, n.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: "pointer" }}
            >
              {/* 透明热区：方便抓取 */}
              <circle cx={c.x} cy={c.y} r={13} fill="transparent" />
              {(isCurrent || isOnPath) && (
                <circle cx={c.x} cy={c.y} r={r + 1.5} fill="#fff" />
              )}
              <circle cx={c.x} cy={c.y} r={r} fill={color} />
            </g>
          );
        })}

        {/* 拖拽中的幽灵圆环 */}
        {drag && (
          <circle
            cx={drag.x}
            cy={drag.y}
            r={8}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth={1}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}
      </svg>

      <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-white/90 px-1 py-px text-[9px] text-neutral-400 opacity-0 transition-opacity hover:opacity-100">
        拖拽圆点可合并
      </span>

      {mergeState && (
        <MergeDialog
          open
          sourceId={mergeState.sourceId}
          targetId={mergeState.targetId}
          onClose={() => setMergeState(null)}
        />
      )}
    </div>
  );
}

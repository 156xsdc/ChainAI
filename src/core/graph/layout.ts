/**
 * Git 风格布局算法（确定性，非力导向）
 *
 * 设计：
 * - 纵向 = 时间线：按拓扑层分配行（row），父在上、子在下
 * - 横向 = 分支轨道：同一链条继承父轨道（lane），分叉开新轨道，合并汇聚
 * - 输出：每个节点的 {x, y, lane, row}
 *
 * 参考 Git 提交图：纵向时间推进，横向分支展开，合并点收敛。
 */
import type { TreeEdge, TreeNode } from "../db/types";

export interface LayoutOptions {
  /** 轨道宽度（px） */
  laneWidth?: number;
  /** 行高（px） */
  rowHeight?: number;
}

export interface NodePosition {
  x: number;
  y: number;
  lane: number;
  row: number;
}

export interface GitLayoutResult {
  positions: Map<string, NodePosition>;
  width: number;
  height: number;
}

export function computeGitLayout(
  nodes: TreeNode[],
  edges: TreeEdge[],
  options: LayoutOptions = {}
): GitLayoutResult {
  const laneWidth = options.laneWidth ?? 210;
  const rowHeight = options.rowHeight ?? 76;

  const nodeSet = new Set(nodes.map((n) => n.id));
  const createdAt = new Map(nodes.map((n) => [n.id, n.createdAt]));

  // ---- 1. 拓扑排序（Kahn），分层 ----
  const childrenOf = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    childrenOf.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    if (!nodeSet.has(e.parentId) || !nodeSet.has(e.childId)) continue;
    childrenOf.get(e.parentId)!.push(e.childId);
    inDegree.set(e.childId, (inDegree.get(e.childId) ?? 0) + 1);
  }

  // 初始队列：所有入度为0的节点（根），按创建时间排序
  const queue = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .sort((a, b) => (createdAt.get(a) ?? "").localeCompare(createdAt.get(b) ?? ""));

  const topoOrder: string[] = [];
  const rowOf = new Map<string, number>();
  let row = 0;
  const remaining = new Set(nodes.map((n) => n.id));

  while (queue.length > 0) {
    const level = [...queue].sort((a, b) =>
      (createdAt.get(a) ?? "").localeCompare(createdAt.get(b) ?? "")
    );
    queue.length = 0;

    for (const id of level) {
      topoOrder.push(id);
      rowOf.set(id, row);
      remaining.delete(id);
      for (const child of childrenOf.get(id) ?? []) {
        const d = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, d);
        if (d === 0) queue.push(child);
      }
    }
    queue.sort((a, b) =>
      (createdAt.get(a) ?? "").localeCompare(createdAt.get(b) ?? "")
    );
    row++;
  }

  // 环路残留（异常数据）：追加到末尾，保证所有节点都有位置
  for (const id of [...remaining]) {
    topoOrder.push(id);
    rowOf.set(id, row++);
  }

  // ---- 2. lane（轨道）分配 ----
  const laneOf = new Map<string, number>();
  const laneLastRow = new Map<number, number>();
  const childCount = new Map<string, number>(); // 父 → 已分配子数

  /** 找空闲轨道：避开指定轨道，且当前行未被占用 */
  const findLane = (preferred: number[], r: number): number => {
    let lane = 0;
    for (;;) {
      if (!preferred.includes(lane) && laneLastRow.get(lane) !== r) return lane;
      lane++;
    }
  };

  for (const id of topoOrder) {
    const r = rowOf.get(id) ?? 0;
    const parents = edges
      .filter((e) => e.childId === id && nodeSet.has(e.parentId))
      .map((e) => e.parentId);

    let lane: number;
    if (parents.length === 0) {
      lane = findLane([], r);
    } else {
      const parentLanes = [
        ...new Set(
          parents.map((p) => laneOf.get(p)).filter((l) => l !== undefined)
        ),
      ];
      const singleParent = parents.length === 1;
      const p = parents[0];
      const pLane = laneOf.get(p);
      const isFirstChild = singleParent && (childCount.get(p) ?? 0) === 0;
      if (
        singleParent &&
        pLane !== undefined &&
        isFirstChild &&
        laneLastRow.get(pLane) !== r
      ) {
        lane = pLane; // 继承父轨道（链条延续）
      } else {
        lane = findLane(parentLanes, r); // 分叉/合并：新开轨道
      }
      for (const p2 of parents) {
        childCount.set(p2, (childCount.get(p2) ?? 0) + 1);
      }
    }

    laneOf.set(id, lane);
    laneLastRow.set(lane, r);
  }

  // ---- 3. 生成位置 ----
  const positions = new Map<string, NodePosition>();
  let maxLane = 0;
  let maxRow = 0;
  for (const id of topoOrder) {
    const lane = laneOf.get(id) ?? 0;
    const r = rowOf.get(id) ?? 0;
    maxLane = Math.max(maxLane, lane);
    maxRow = Math.max(maxRow, r);
    positions.set(id, { x: lane * laneWidth, y: r * rowHeight, lane, row: r });
  }

  return {
    positions,
    width: (maxLane + 1) * laneWidth,
    height: (maxRow + 1) * rowHeight,
  };
}

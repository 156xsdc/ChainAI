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
  /** 节点宽度（px，用于居中防重叠检测，默认 30） */
  nodeWidth?: number;
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
  const nodeWidth = options.nodeWidth ?? 30;

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

  // 预建：childId → parentIds 索引（避免循环内 filter，O(N·E) → O(N+E)）
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeSet.has(e.parentId) || !nodeSet.has(e.childId)) continue;
    if (!parentsOf.has(e.childId)) parentsOf.set(e.childId, []);
    parentsOf.get(e.childId)!.push(e.parentId);
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
    const parents = parentsOf.get(id) ?? [];

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
  // 按层计算 y：同层节点共享 y；若该层任一节点有多个子节点（分叉），
  // 则到下一层的垂直间距 = 2 × 线性间距（给曲线散开留空间）
  const positions = new Map<string, NodePosition>();
  let maxLane = 0;
  const maxRow = Math.max(0, ...rowOf.values());
  const layerY = new Map<number, number>();
  let y = 0;
  for (let layer = 0; layer <= maxRow; layer++) {
    layerY.set(layer, y);
    const layerNodes = topoOrder.filter((id) => rowOf.get(id) === layer);
    const hasBranch = layerNodes.some(
      (id) => (childrenOf.get(id) ?? []).length > 1
    );
    y += hasBranch ? rowHeight * 2 : rowHeight;
  }

  for (const id of topoOrder) {
    const lane = laneOf.get(id) ?? 0;
    const r = rowOf.get(id) ?? 0;
    maxLane = Math.max(maxLane, lane);
    positions.set(id, {
      x: lane * laneWidth,
      y: layerY.get(r) ?? 0,
      lane,
      row: r,
    });
  }

  // ---- 4. 居中调整：父节点水平居中于其直接子节点 ----
  // 自底向上处理，父节点 x = 子节点 x 均值；若与同层其他节点冲突则保持原位置
  const byRow = new Map<number, string[]>();
  for (const [id, pos] of positions) {
    const list = byRow.get(pos.row);
    if (list) list.push(id);
    else byRow.set(pos.row, [id]);
  }
  const sortedRows = [...byRow.keys()].sort((a, b) => b - a);
  for (const r of sortedRows) {
    const rowIds = byRow.get(r)!;
    for (const id of rowIds) {
      const kids = childrenOf.get(id) ?? [];
      if (kids.length === 0) continue;
      const kidPositions = kids
        .map((k) => positions.get(k))
        .filter((p): p is NodePosition => !!p);
      if (kidPositions.length === 0) continue;
      const centerX =
        kidPositions.reduce((sum, p) => sum + p.x, 0) / kidPositions.length;
      // 防重叠：同层其他节点距中心过近则不调整
      const conflict = rowIds.some((o) => {
        if (o === id) return false;
        const op = positions.get(o)!;
        return Math.abs(op.x - centerX) < nodeWidth;
      });
      if (!conflict) {
        const cur = positions.get(id)!;
        positions.set(id, { ...cur, x: centerX });
      }
    }
  }

  return {
    positions,
    width: (maxLane + 1) * laneWidth,
    height: y,
  };
}

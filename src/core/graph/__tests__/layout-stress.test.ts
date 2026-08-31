/**
 * 布局压力测试：多分支/合并场景下节点不得重叠
 */
import { describe, it, expect } from "vitest";
import { computeGitLayout } from "../layout";
import type { TreeEdge, TreeNode } from "../../db/types";

function node(id: string, createdAt = id): TreeNode {
  return {
    id,
    treeId: "t",
    question: id,
    answer: "",
    answerVersion: 1,
    type: "normal",
    summary: "",
    color: "#333",
    isKept: false,
    isFavorited: false,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };
}

function edge(parentId: string, childId: string): TreeEdge {
  return {
    id: `${parentId}-${childId}`,
    parentId,
    childId,
    relationType: "inherit",
    createdAt: "",
  };
}

/** 检查布局中任意两节点是否重叠（x/y 中心距离均小于节点尺寸） */
function findOverlaps(
  positions: Map<string, { x: number; y: number }>,
  nodeW = 26,
  nodeH = 30
): Array<[string, string, number, number]> {
  const out: Array<[string, string, number, number]> = [];
  const ids = [...positions.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions.get(ids[i])!;
      const b = positions.get(ids[j])!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx < nodeW && dy < nodeH) {
        out.push([ids[i], ids[j], dx, dy]);
      }
    }
  }
  return out;
}

/** 所有节点 x 应对齐 lane 网格（laneWidth 整数倍）——避免"半格"视觉混乱 */
function findOffGrid(
  positions: Map<string, { x: number; lane: number }>,
  laneWidth: number
): string[] {
  const out: string[] = [];
  for (const [id, p] of positions) {
    if (Math.round(p.x / laneWidth) * laneWidth !== p.x) {
      out.push(`${id}(x=${p.x},lane=${p.lane})`);
    }
  }
  return out;
}

describe("布局压力测试：多分支不重叠", () => {
  it("单层多分支（根下 6 个分支）", () => {
    const nodes = [node("root"), ...Array.from({ length: 6 }, (_, i) => node(`b${i + 1}`))];
    const edges = nodes.slice(1).map((n) => edge("root", n.id));
    const { positions } = computeGitLayout(nodes, edges, {
      laneWidth: 84,
      rowHeight: 52,
      nodeWidth: 26,
    });
    expect(findOverlaps(positions)).toEqual([]);
    expect(findOffGrid(positions, 84)).toEqual([]);
  });

  it("多级分叉（根→3支→每支再分3）", () => {
    const nodes = [node("root")];
    const edges: TreeEdge[] = [];
    for (let i = 1; i <= 3; i++) {
      const mid = `m${i}`;
      nodes.push(node(mid));
      edges.push(edge("root", mid));
      for (let j = 1; j <= 3; j++) {
        const leaf = `m${i}l${j}`;
        nodes.push(node(leaf));
        edges.push(edge(mid, leaf));
      }
    }
    const { positions } = computeGitLayout(nodes, edges, {
      laneWidth: 84,
      rowHeight: 52,
      nodeWidth: 26,
    });
    expect(findOverlaps(positions)).toEqual([]);
    expect(findOffGrid(positions, 84)).toEqual([]);
  });

  it("合并节点（两个父 → 合并 → 再分叉）", () => {
    const nodes = [node("a"), node("b"), node("m"), node("x"), node("y"), node("z")];
    const edges: TreeEdge[] = [
      edge("a", "m"),
      edge("b", "m"),
      edge("m", "x"),
      edge("m", "y"),
      edge("m", "z"),
    ];
    const { positions } = computeGitLayout(nodes, edges, {
      laneWidth: 84,
      rowHeight: 52,
      nodeWidth: 26,
    });
    expect(findOverlaps(positions)).toEqual([]);
    expect(findOffGrid(positions, 84)).toEqual([]);
  });

  it("深层链 + 多分支（10层，每层分叉）", () => {
    const nodes: TreeNode[] = [node("n0")];
    const edges: TreeEdge[] = [];
    for (let i = 0; i < 10; i++) {
      const parent = `n${i}`;
      const child1 = `n${i + 1}a`;
      const child2 = `n${i + 1}b`;
      nodes.push(node(child1), node(child2));
      edges.push(edge(parent, child1), edge(parent, child2));
    }
    const { positions } = computeGitLayout(nodes, edges, {
      laneWidth: 84,
      rowHeight: 52,
      nodeWidth: 26,
    });
    expect(findOverlaps(positions)).toEqual([]);
    expect(findOffGrid(positions, 84)).toEqual([]);
  });
});

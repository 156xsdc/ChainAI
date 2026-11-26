import { describe, it, expect } from "vitest";
import { computeGitLayout } from "../layout";
import type { TreeEdge, TreeNode } from "../../db/types";

function node(id: string, createdAt = "2026-01-01T00:00:00.000Z"): TreeNode {
  return {
    id,
    treeId: null,
    question: `Q${id}`,
    answer: "",
    type: "normal",
    summary: "",
    color: "#333333",
    isKept: false,
    isFavorited: false,
    isActive: true,
    answerVersion: 1,
    quote: "",
    reasoning: "",
    docRefs: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function edge(parentId: string, childId: string, relationType: "inherit" | "non_inherit" = "inherit"): TreeEdge {
  return {
    id: `${parentId}-${childId}`,
    parentId,
    childId,
    relationType,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("computeGitLayout", () => {
  it("线性链：同一轨道，父在上子在下", () => {
    const nodes = [node("r", "t0"), node("a", "t1"), node("b", "t2")];
    const edges = [edge("r", "a"), edge("a", "b")];
    const { positions } = computeGitLayout(nodes, edges);

    const r = positions.get("r")!;
    const a = positions.get("a")!;
    const b = positions.get("b")!;
    expect(r.lane).toBe(a.lane);
    expect(a.lane).toBe(b.lane);
    expect(r.row).toBeLessThan(a.row);
    expect(a.row).toBeLessThan(b.row);
  });

  it("分叉：子节点开新轨道", () => {
    const nodes = [node("r", "t0"), node("a1", "t1"), node("a2", "t2")];
    const edges = [edge("r", "a1"), edge("r", "a2")];
    const { positions } = computeGitLayout(nodes, edges);

    const r = positions.get("r")!;
    const a1 = positions.get("a1")!;
    const a2 = positions.get("a2")!;
    expect(a1.lane).toBe(r.lane); // 第一个子继承父轨道
    expect(a2.lane).not.toBe(a1.lane); // 第二个子新开轨道
    expect(a1.row).toBe(a2.row); // 同层
  });

  it("合并：两条轨道汇聚到合并节点", () => {
    const nodes = [
      node("a", "t0"),
      node("b", "t1"),
      node("m", "t2"),
    ];
    const edges = [edge("a", "m"), edge("b", "m")];
    const { positions } = computeGitLayout(nodes, edges);

    const a = positions.get("a")!;
    const b = positions.get("b")!;
    const m = positions.get("m")!;
    expect(a.lane).not.toBe(b.lane);
    expect(m.row).toBeGreaterThan(a.row);
    expect(m.row).toBeGreaterThan(b.row);
  });

  it("全树：分叉+继续+合并，无重叠且顺序正确", () => {
    // 根 → A → A1 → A2
    // 根 → B → B1
    // A2 与 B1 合并 → M
    const nodes = [
      node("root", "t0"),
      node("A", "t1"),
      node("B", "t2"),
      node("A1", "t3"),
      node("B1", "t4"),
      node("A2", "t5"),
      node("M", "t6"),
    ];
    const edges = [
      edge("root", "A"),
      edge("root", "B"),
      edge("A", "A1"),
      edge("B", "B1"),
      edge("A1", "A2"),
      edge("A2", "M"),
      edge("B1", "M"),
    ];
    const { positions } = computeGitLayout(nodes, edges);

    // 每个节点都有位置
    for (const n of nodes) {
      expect(positions.get(n.id)).toBeDefined();
    }

    // 父行 < 子行
    const row = (id: string) => positions.get(id)!.row;
    expect(row("root")).toBeLessThan(row("A"));
    expect(row("A")).toBeLessThan(row("A1"));
    expect(row("A1")).toBeLessThan(row("A2"));
    expect(row("B")).toBeLessThan(row("B1"));
    expect(row("A2")).toBeLessThan(row("M"));

    // A 链和 B 链不同轨道
    expect(positions.get("A")!.lane).not.toBe(positions.get("B")!.lane);

    // 同层节点不重叠（同层不同 lane 或不同 row）
    const seen = new Map<string, Set<number>>();
    for (const n of nodes) {
      const p = positions.get(n.id)!;
      const s = seen.get(`${p.row}`) ?? new Set<number>();
      expect(s.has(p.lane)).toBe(false); // 同一行同一轨道不重复
      s.add(p.lane);
      seen.set(`${p.row}`, s);
    }
  });

  it("多个根节点：各自占轨道", () => {
    const nodes = [node("r1", "t0"), node("r2", "t1")];
    const edges: TreeEdge[] = [];
    const { positions } = computeGitLayout(nodes, edges);
    expect(positions.get("r1")!.lane).not.toBe(positions.get("r2")!.lane);
  });

  it("新开始节点（虚线边）也参与布局", () => {
    const nodes = [node("r", "t0"), node("ns", "t1"), node("ns1", "t2")];
    const edges = [edge("r", "ns", "non_inherit"), edge("ns", "ns1")];
    const { positions } = computeGitLayout(nodes, edges);
    expect(positions.get("ns")).toBeDefined();
    expect(positions.get("ns")!.row).toBeGreaterThan(positions.get("r")!.row);
    expect(positions.get("ns1")!.row).toBeGreaterThan(positions.get("ns")!.row);
  });

  it("父节点水平居中于其直接子节点", () => {
    // 根 → A, B, C（三个子节点，不同轨道）
    const nodes = [
      node("root", "t0"),
      node("A", "t1"),
      node("B", "t2"),
      node("C", "t3"),
    ];
    const edges = [edge("root", "A"), edge("root", "B"), edge("root", "C")];
    const { positions } = computeGitLayout(nodes, edges, {
      laneWidth: 100,
      nodeWidth: 26,
    });

    const kids = ["A", "B", "C"].map((k) => positions.get(k)!);
    const centerX = kids.reduce((s, p) => s + p.x, 0) / kids.length;
    const root = positions.get("root")!;
    // 无冲突时 root 居中于子节点
    expect(Math.abs(root.x - centerX)).toBeLessThan(1);
    // 子节点平均分布（不同轨道；左右交替布局下顺序可能不单调，排序后检查等距）
    const xs = kids.map((k) => k.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 5);
  });

  it("居中不与同层节点冲突时保持（链式结构）", () => {
    // 线性链：每个节点只有一个子 → 不触发居中调整，保持原轨道
    const nodes = [node("r", "t0"), node("a", "t1"), node("b", "t2")];
    const edges = [edge("r", "a"), edge("a", "b")];
    const { positions } = computeGitLayout(nodes, edges, { nodeWidth: 26 });
    expect(positions.get("r")!.x).toBe(positions.get("a")!.x);
    expect(positions.get("a")!.x).toBe(positions.get("b")!.x);
  });

  it("分叉处垂直间距 = 2 × 线性间距", () => {
    // 线性链 r→a→b：间距 rowHeight
    // 分叉 r→c1,c2：r 到 c1/c2 间距 = 2 × rowHeight
    const ROW = 60;
    const nodes = [
      node("r", "t0"),
      node("a", "t1"),
      node("b", "t2"),
      node("c1", "t1"),
      node("c2", "t2"),
    ];
    const edges = [
      edge("r", "a"),
      edge("a", "b"),
      edge("r", "c1"),
      edge("c1", "c2"),
    ];
    const { positions } = computeGitLayout(nodes, edges, {
      rowHeight: ROW,
      nodeWidth: 26,
    });

    const gap = (a: string, b: string) =>
      Math.abs(positions.get(a)!.y - positions.get(b)!.y);
    // 线性：r→a 与 a→b 都是 rowHeight（r 有分叉 → r→a 是 2×？）
    // r 有多个子（a 和 c1）→ r 到子节点间距 = 2 × ROW
    expect(gap("r", "a")).toBe(ROW * 2);
    expect(gap("r", "c1")).toBe(ROW * 2);
    // a 只有 b 一个子 → a→b = ROW
    expect(gap("a", "b")).toBe(ROW);
    // c1 只有 c2 一个子 → c1→c2 = ROW
    expect(gap("c1", "c2")).toBe(ROW);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import type { AppRepositories } from "../index";
import { createTestDb } from "./helpers";

describe("NodeRepository", () => {
  let repo: AppRepositories;

  beforeEach(async () => {
    repo = await createTestDb();
  });

  it("创建并读取节点", async () => {
    const node = await repo.nodes.createNode({
      question: "你好",
      answer: "世界",
    });
    expect(node.question).toBe("你好");
    expect(node.type).toBe("normal");
    expect(node.isKept).toBe(false);

    const got = await repo.nodes.getNode(node.id);
    expect(got?.answer).toBe("世界");
  });

  it("更新节点", async () => {
    const node = await repo.nodes.createNode({ question: "q" });
    const updated = await repo.nodes.updateNode(node.id, {
      question: "q2",
      isKept: true,
      isFavorited: true,
    });
    expect(updated?.question).toBe("q2");
    expect(updated?.isKept).toBe(true);
    expect(updated?.isFavorited).toBe(true);
  });

  it("addEdge 与 getChildren（含虚线区分）", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const c1 = await repo.nodes.createNode({ question: "子1" });
    const c2 = await repo.nodes.createNode({ question: "子2" });
    await repo.nodes.addEdge(root.id, c1.id, "inherit");
    await repo.nodes.addEdge(root.id, c2.id, "non_inherit");

    const children = await repo.nodes.getChildren(root.id);
    expect(children.map((c) => c.id)).toEqual([c1.id, c2.id]);

    const withEdge = await repo.nodes.getChildrenWithEdge(root.id);
    expect(withEdge[0].edge.relationType).toBe("inherit");
    expect(withEdge[1].edge.relationType).toBe("non_inherit");
  });

  it("getPathToRoot 返回从根到当前节点的路径", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const branch = await repo.nodes.createNode({ question: "分支" });
    await repo.nodes.addEdge(root.id, branch.id);
    const leaf = await repo.nodes.createNode({ question: "叶子" });
    await repo.nodes.addEdge(branch.id, leaf.id);

    const path = await repo.nodes.getPathToRoot(leaf.id);
    expect(path.map((p) => p.node.question)).toEqual(["根", "分支", "叶子"]);
    expect(path[1].relationType).toBe("inherit");
    expect(path[0].relationType).toBeNull(); // 根无父边
  });

  it("多父节点（合并）的父/祖先查询", async () => {
    const a = await repo.nodes.createNode({ question: "A" });
    const b = await repo.nodes.createNode({ question: "B" });
    const c = await repo.nodes.createNode({ question: "C", type: "merge" });
    await repo.nodes.addEdge(a.id, c.id);
    await repo.nodes.addEdge(b.id, c.id);

    const parents = await repo.nodes.getParents(c.id);
    expect(parents).toHaveLength(2);

    const ancestors = await repo.nodes.getAncestors(c.id);
    expect(ancestors.map((x) => x.question).sort()).toEqual(["A", "B"]);
  });

  it("getSubtree 返回子树节点和内部边", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const a = await repo.nodes.createNode({ question: "A" });
    const a1 = await repo.nodes.createNode({ question: "A1" });
    const a2 = await repo.nodes.createNode({ question: "A2" });
    const outside = await repo.nodes.createNode({ question: "外部" });
    await repo.nodes.addEdge(root.id, a.id);
    await repo.nodes.addEdge(a.id, a1.id);
    await repo.nodes.addEdge(a.id, a2.id);
    await repo.nodes.addEdge(root.id, outside.id);

    const { nodes, edges } = await repo.nodes.getSubtree(a.id);
    expect(nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([a.id, a1.id, a2.id])
    );
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    // 不包含子树外的节点
    expect(nodes.map((n) => n.id)).not.toContain(outside.id);
  });

  it("getDescendantIds 返回全部后代", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const a = await repo.nodes.createNode({ question: "A" });
    await repo.nodes.addEdge(root.id, a.id);
    const ids = await repo.nodes.getDescendantIds(root.id);
    expect(ids.sort()).toEqual([root.id, a.id].sort());
  });

  it("软删除后不可见", async () => {
    const node = await repo.nodes.createNode({ question: "x" });
    await repo.nodes.softDeleteNode(node.id);
    expect(await repo.nodes.getNode(node.id)).toBeNull();
    expect(await repo.nodes.getAllActive()).toHaveLength(0);
  });

  it("重复边 INSERT OR IGNORE 幂等", async () => {
    const a = await repo.nodes.createNode({ question: "A" });
    const b = await repo.nodes.createNode({ question: "B" });
    await repo.nodes.addEdge(a.id, b.id);
    await repo.nodes.addEdge(a.id, b.id);
    const parents = await repo.nodes.getParents(b.id);
    expect(parents).toHaveLength(1);
  });
});

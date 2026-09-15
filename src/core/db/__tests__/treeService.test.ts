import { describe, it, expect, beforeEach } from "vitest";
import { TreeService } from "../../tree/treeService";
import type { AppRepositories } from "../index";
import { createTestDb } from "./helpers";

describe("TreeService", () => {
  let repo: AppRepositories;
  let service: TreeService;

  beforeEach(async () => {
    repo = await createTestDb();
    service = new TreeService(repo.backend, repo.nodes, repo.sessions);
  });

  it("addChild 创建普通子节点（实线继承）", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const { node, edge } = await service.addChild(root.id, {
      question: "继续",
    });
    expect(node.type).toBe("normal");
    expect(edge.relationType).toBe("inherit");
  });

  it("createBranch count 模式：新会话 + 实线 + 继承数量 + 父会话关联", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const parentSession = await repo.sessions.create({
      startNodeId: root.id,
      name: "根会话",
    });

    const result = await service.createBranch(root.id, {
      name: "分支A",
      inheritMode: "count",
      inheritCount: 5,
    });

    expect(result.node.type).toBe("normal");
    expect(result.edge?.relationType).toBe("inherit");
    expect(result.session.name).toBe("分支A");
    expect(result.session.inheritCount).toBe(5);
    expect(result.session.parentId).toBe(parentSession.id);
    expect(result.session.startNodeId).toBe(result.node.id);
  });

  it("createBranch 默认 count=10", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const result = await service.createBranch(root.id, { name: "默认" });
    expect(result.session.inheritCount).toBe(10);
  });

  it("createNewStart：新开始节点 + 虚线 + 不继承", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const result = await service.createNewStart(root.id, { name: "新开始" });

    expect(result.node.type).toBe("new_start");
    expect(result.edge?.relationType).toBe("non_inherit");
    expect(result.session.inheritCount).toBe(0);
  });

  it("createMerge：合并节点 + 多父实线 + 新会话", async () => {
    const a = await repo.nodes.createNode({ question: "A" });
    const b = await repo.nodes.createNode({ question: "B" });

    const result = await service.createMerge([a.id, b.id], { name: "合并C" });

    expect(result.node.type).toBe("merge");
    expect(result.edges).toHaveLength(2);
    expect(result.edges.every((e) => e.relationType === "inherit")).toBe(true);
    expect(result.session.startNodeId).toBe(result.node.id);

    const parents = await repo.nodes.getParents(result.node.id);
    expect(parents.map((p) => p.question).sort()).toEqual(["A", "B"]);
  });

  it("createMerge 少于两个父节点时报错", async () => {
    const a = await repo.nodes.createNode({ question: "A" });
    await expect(service.createMerge([a.id])).rejects.toThrow("至少");
  });

  it("resolveUpNodeId：分支内任意深度都回到分叉点（不是上一节点）", async () => {
    const n1 = await repo.nodes.createNode({ question: "主线1" });
    const n2 = await repo.nodes.createNode({ question: "主线2" });
    await repo.nodes.addEdge(n1.id, n2.id);

    // 从 n2 分叉，分支内继续两层
    const { node: b1 } = await service.createBranch(n2.id, { name: "分支" });
    const { node: b2 } = await service.addChild(b1.id, { question: "分支内1" });
    const { node: b3 } = await service.addChild(b2.id, { question: "分支内2" });

    // 分支起点 → 分叉点
    expect(await service.resolveUpNodeId(b1.id)).toBe(n2.id);
    // 分支深处 → 依然是分叉点（而不是上一节点 b2）
    expect(await service.resolveUpNodeId(b3.id)).toBe(n2.id);
    // 主链不受影响：仍然是上一节点
    expect(await service.resolveUpNodeId(n2.id)).toBe(n1.id);
    // 根节点没有上级
    expect(await service.resolveUpNodeId(n1.id)).toBeNull();
  });

  it("resolveUpNodeId：嵌套分支逐层回退 + 新开始同样按分叉点处理", async () => {
    const n1 = await repo.nodes.createNode({ question: "主线" });
    const { node: b1 } = await service.createBranch(n1.id, { name: "分支A" });
    const { node: b1c } = await service.addChild(b1.id, { question: "A 内" });
    // 在分支 A 内部再分叉出分支 B
    const { node: b2 } = await service.createBranch(b1c.id, { name: "分支B" });
    const { node: b2c } = await service.addChild(b2.id, { question: "B 内" });

    // 分支 B 内 → 回到 B 的分叉点（分支 A 内的节点）
    expect(await service.resolveUpNodeId(b2c.id)).toBe(b1c.id);
    // 分支 A 内 → 回到 A 的分叉点（主线）
    expect(await service.resolveUpNodeId(b1c.id)).toBe(n1.id);

    // 「新开始」同样按分叉点处理
    const { node: s1 } = await service.createNewStart(n1.id, { name: "新开始" });
    const { node: s2 } = await service.addChild(s1.id, { question: "新开始内" });
    expect(await service.resolveUpNodeId(s2.id)).toBe(n1.id);
  });

  it("getContextPath 返回问答消息序列", async () => {
    const root = await repo.nodes.createNode({
      question: "Q1",
      answer: "A1",
    });
    const branch = await repo.nodes.createNode({ question: "Q2" });
    await repo.nodes.addEdge(root.id, branch.id);

    const path = await service.getContextPath(branch.id);
    expect(path).toEqual([
      { role: "user", content: "Q1", nodeId: root.id },
      { role: "assistant", content: "A1", nodeId: root.id },
      { role: "user", content: "Q2", nodeId: branch.id },
    ]);
  });

  it("合并节点上下文链综合所有父链（getContextPath 多父回溯）", async () => {
    const a = await repo.nodes.createNode({ question: "QA", answer: "AA" });
    const b = await repo.nodes.createNode({ question: "QB", answer: "AB" });
    const merge = await service.createMerge([a.id, b.id], { name: "合并" });

    const path = await service.getContextPath(merge.node.id);
    const questions = path.filter((m) => m.role === "user").map((m) => m.content);
    // 综合所有父链：A 与 B 的问题都在
    expect(questions).toEqual(expect.arrayContaining(["QA", "QB"]));
  });
});

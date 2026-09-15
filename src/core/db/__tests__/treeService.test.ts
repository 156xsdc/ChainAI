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

  it("resolveUpNodeId：从深处一步回到分叉点（四大文明古国场景）", async () => {
    // 根 → 文明古国；从文明古国延伸出"古中国 → 夏朝"，并从文明古国分叉出"古埃及"
    const root = await repo.nodes.createNode({ question: "根" });
    const civ = await repo.nodes.createNode({ question: "四大文明古国" });
    await repo.nodes.addEdge(root.id, civ.id);
    const { node: china } = await service.addChild(civ.id, { question: "古中国" });
    const { node: xia } = await service.addChild(china.id, { question: "夏朝" });
    await service.createBranch(civ.id, { name: "古埃及" });

    // 关键：从"夏朝"点上级 → 直接回到分叉点"四大文明古国"（而不是"古中国"）
    expect(await service.resolveUpNodeId(xia.id)).toBe(civ.id);
    // 古中国 → 四大文明古国（上一节点恰是分叉点，行为一致）
    expect(await service.resolveUpNodeId(china.id)).toBe(civ.id);
    // 分叉点本身再往上：上面是线性段 → 上一节点
    expect(await service.resolveUpNodeId(civ.id)).toBe(root.id);
    // 根节点没有上级
    expect(await service.resolveUpNodeId(root.id)).toBeNull();
  });

  it("resolveUpNodeId：分支起点父节点（唯一子节点也是分叉出来的）同样算分叉点", async () => {
    // 从叶子节点分叉：父节点只有一个子节点，但它是"分叉出来的"
    const leaf = await repo.nodes.createNode({ question: "叶子" });
    const { node: b1 } = await service.createBranch(leaf.id, { name: "分支" });
    const { node: b2 } = await service.addChild(b1.id, { question: "分支内1" });
    const { node: b3 } = await service.addChild(b2.id, { question: "分支内2" });

    expect(await service.resolveUpNodeId(b1.id)).toBe(leaf.id);
    expect(await service.resolveUpNodeId(b3.id)).toBe(leaf.id);
  });

  it("resolveUpNodeId：纯线性对话退化为上一节点；嵌套分支回到最近的分叉点", async () => {
    // 线性链：a → b → c（一路上无分叉）
    const a = await repo.nodes.createNode({ question: "A" });
    const b = await repo.nodes.createNode({ question: "B" });
    const c = await repo.nodes.createNode({ question: "C" });
    await repo.nodes.addEdge(a.id, b.id);
    await repo.nodes.addEdge(b.id, c.id);
    expect(await service.resolveUpNodeId(c.id)).toBe(b.id);
    expect(await service.resolveUpNodeId(b.id)).toBe(a.id);
    expect(await service.resolveUpNodeId(a.id)).toBeNull();

    // 在 a 处再分叉：从 c 出发应回到最近的分叉点 a
    await service.createBranch(a.id, { name: "分叉" });
    expect(await service.resolveUpNodeId(c.id)).toBe(a.id);

    // 嵌套：分支内再分叉，则回到内层分叉点
    const { node: inner } = await service.createBranch(b.id, { name: "内层分支" });
    const { node: innerChild } = await service.addChild(inner.id, { question: "内层继续" });
    expect(await service.resolveUpNodeId(innerChild.id)).toBe(b.id);
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

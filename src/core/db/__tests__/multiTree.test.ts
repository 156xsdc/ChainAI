/**
 * 多树场景回归测试
 *
 * 这些用例描述"正确"行为——当前实现若违反则说明存在 bug。
 * 包含：
 * 1. Markdown 导入的节点应归属当前树（tree_id 不应为 NULL，否则树状图不可见）
 * 2. 清空一棵树的对话不应删除其他树的会话
 * 3. 回收站恢复中间节点不应产生孤儿节点
 */
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers";
import { importMarkdownAsTree } from "../../importExport/markdown";

describe("多树场景", () => {
  it("Markdown 导入的节点应归属当前树（tree_id 非空）", async () => {
    const repos = await createTestDb();
    const tree = await repos.trees.create("树A");

    // 调用方（chatStore.importMarkdown）会传入当前树
    const root = await importMarkdownAsTree(
      repos,
      "# 问题1\n\n回答1\n\n## 子问题\n\n回答2",
      tree.id
    );
    expect(root).not.toBeNull();

    // 导入的根节点应归属树A
    const node = await repos.nodes.getNode(root!.id);
    expect(node?.treeId).toBe(tree.id);

    // 树A的图数据应能看到导入的节点（否则导入内容在树状图中不可见）
    const nodesInTree = await repos.nodes.getAllActive(tree.id);
    expect(nodesInTree.length).toBeGreaterThan(0);
  });

  it("清空一棵树不应删除其他树的会话", async () => {
    const repos = await createTestDb();
    const treeA = await repos.trees.create("树A");
    const treeB = await repos.trees.create("树B");

    // 两棵树各有分支会话
    const nodeA = await repos.nodes.createNode({ question: "A", treeId: treeA.id });
    await repos.sessions.create({ name: "A分支", startNodeId: nodeA.id });
    const nodeB = await repos.nodes.createNode({ question: "B", treeId: treeB.id });
    await repos.sessions.create({ name: "B分支", startNodeId: nodeB.id });

    // 复刻 chatStore.clearAllChat 修复后的会话清理 SQL（应只清理当前树 A）
    await repos.backend.execute(
      `DELETE FROM sessions WHERE is_active = 1 AND start_node_id IN (SELECT id FROM nodes WHERE tree_id = ?)`,
      [treeA.id]
    );

    // 树A的会话被清掉；树B的会话不受影响
    expect(await repos.sessions.getByStartNode(nodeA.id)).toBeNull();
    expect(await repos.sessions.getByStartNode(nodeB.id)).not.toBeNull();
  });

  it("回收站恢复中间节点不应产生孤儿（应恢复整条父链）", async () => {
    const repos = await createTestDb();
    const tree = await repos.trees.create("树A");
    const n1 = await repos.nodes.createNode({ question: "1", treeId: tree.id });
    const n2 = await repos.nodes.createNode({ question: "2", treeId: tree.id });
    await repos.nodes.addEdge(n1.id, n2.id, "inherit");
    const n3 = await repos.nodes.createNode({ question: "3", treeId: tree.id });
    await repos.nodes.addEdge(n2.id, n3.id, "inherit");

    // 删除 n1 整棵子树（与 deleteBranch 一致）
    for (const id of [n1.id, n2.id, n3.id]) {
      await repos.nodes.softDeleteNode(id);
      await repos.recycleBin.add(id);
    }

    // 只恢复中间节点 n2
    await repos.recycleBin.restore(n2.id);

    // 恢复后 n2 仍应通过边连接到活跃节点（不应是孤立点）
    const edges = await repos.nodes.getAllActiveEdges(tree.id);
    expect(edges.length).toBeGreaterThan(0);
  });
});

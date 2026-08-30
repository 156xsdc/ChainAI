import { describe, it, expect } from "vitest";
import { NodeSqliteBackend } from "../backendNode";
import { initSchema, createRepositories } from "../index";

/**
 * 旧库迁移测试：模拟没有 trees 表 / tree_id 列的旧数据库，
 * 验证 initSchema 能正确迁移（建树、补列、索引、归属默认树）
 */
describe("旧库迁移", () => {
  it("无 tree_id 的旧 nodes 表可成功初始化并归属默认树", async () => {
    const backend = new NodeSqliteBackend(":memory:");
    // 模拟旧库结构（无 tree_id，无 trees 表）
    await backend.execute(
      `CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL DEFAULT '',
        answer TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'normal',
        summary TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#333333',
        is_kept INTEGER NOT NULL DEFAULT 0,
        is_favorited INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await backend.execute(
      `INSERT INTO nodes (id, question) VALUES ('n1', '旧问题')`
    );

    // 迁移
    await initSchema(backend);

    // 默认树已创建
    const trees = await backend.select<{ id: string; name: string }>(
      `SELECT id, name FROM trees`
    );
    expect(trees.length).toBe(1);
    expect(trees[0].name).toBe("默认树");

    // 旧节点归属默认树
    const node = await backend.select<{ tree_id: string | null }>(
      `SELECT tree_id FROM nodes WHERE id = 'n1'`
    );
    expect(node[0].tree_id).toBe(trees[0].id);

    // tree_id 索引可用
    const repo = createRepositories(backend);
    const all = await repo.nodes.getAllActive(trees[0].id);
    expect(all.map((n) => n.id)).toEqual(["n1"]);
  });

  it("新库初始化：trees 表 + 索引正常", async () => {
    const backend = new NodeSqliteBackend(":memory:");
    await initSchema(backend);
    const repo = createRepositories(backend);
    const tree = await repo.trees.create("我的项目");
    const node = await repo.nodes.createNode({
      question: "新问题",
      treeId: tree.id,
    });
    expect(node.treeId).toBe(tree.id);
    const byTree = await repo.nodes.getAllActive(tree.id);
    expect(byTree).toHaveLength(1);
  });
});

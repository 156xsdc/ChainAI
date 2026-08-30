import { describe, it, expect, beforeEach } from "vitest";
import { exportAll, importAll, EXPORT_TABLES } from "../service";
import { createTestDb } from "../../db/__tests__/helpers";
import type { AppRepositories } from "../../db";

describe("JSON 导入导出", () => {
  let repo: AppRepositories;

  beforeEach(async () => {
    repo = await createTestDb();
  });

  it("导出包含全部表", async () => {
    const json = await exportAll(repo);
    const data = JSON.parse(json);
    expect(data.app).toBe("chainai");
    expect(data.version).toBe(1);
    for (const t of EXPORT_TABLES) {
      expect(Array.isArray(data.tables[t])).toBe(true);
    }
  });

  it("导出→清空→导入后数据完整恢复", async () => {
    // 准备数据
    const root = await repo.nodes.createNode({ question: "根", answer: "回答" });
    const { node: branch } = await new (await import("../../tree/treeService")).TreeService(
      repo.backend,
      repo.nodes,
      repo.sessions
    ).createBranch(root.id, { name: "分支", inheritCount: 5 });
    await repo.favorites.add(root.id);
    const group = await repo.groups.createGroup({ name: "分组" });
    await repo.groups.addMembers(group.id, [branch.id]);
    await repo.settings.set("theme", "dark");

    const json = await exportAll(repo);

    // 模拟导入到一个全新数据库
    const repo2 = await createTestDb();
    const result = await importAll(repo2, json);

    expect(result.nodes).toBe(2);
    expect(result.edges).toBe(1);
    expect(result.sessions).toBe(1);

    // 验证恢复
    const nodes = await repo2.nodes.getAllActive();
    expect(nodes).toHaveLength(2);
    expect(nodes.find((n) => n.question === "根")?.answer).toBe("回答");

    const sessions = await repo2.sessions.getAll();
    expect(sessions[0].name).toBe("分支");
    expect(sessions[0].inheritCount).toBe(5);

    expect(await repo2.favorites.isFavorited(root.id)).toBe(true);
    expect(await repo2.groups.getMemberIds(group.id)).toEqual([branch.id]);
    expect(await repo2.settings.get("theme", "")).toBe("dark");
  });

  it("无效文件报错", async () => {
    await expect(importAll(repo, "not json")).rejects.toThrow("JSON");
    await expect(
      importAll(repo, JSON.stringify({ app: "other", tables: {} }))
    ).rejects.toThrow("ChainAI");
  });

  it("导入覆盖：旧数据被清空", async () => {
    await repo.nodes.createNode({ question: "旧数据" });
    const json = await exportAll(repo); // 导出含1个节点
    // 再创建一个节点（模拟导入前新增）
    await repo.nodes.createNode({ question: "新数据" });
    await importAll(repo, json);
    const nodes = await repo.nodes.getAllActive();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].question).toBe("旧数据");
  });
});

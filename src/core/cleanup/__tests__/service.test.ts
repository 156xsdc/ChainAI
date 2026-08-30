import { describe, it, expect, beforeEach } from "vitest";
import {
  cleanupOnce,
  findBranchRoots,
  isBranchProtected,
  purgeExpired,
} from "../service";
import { TreeService } from "../../tree/treeService";
import { createTestDb } from "../../db/__tests__/helpers";
import type { AppRepositories, TreeNode } from "../../db";

/** 把节点 updated_at 改旧（模拟不活跃） */
async function ageNode(repos: AppRepositories, node: TreeNode, days: number) {
  await repos.backend.execute(
    `UPDATE nodes SET updated_at = ? WHERE id = ?`,
    [new Date(Date.now() - days * 86400000).toISOString(), node.id]
  );
}

describe("自动清理服务", () => {
  let repo: AppRepositories;
  let service: TreeService;

  beforeEach(async () => {
    repo = await createTestDb();
    service = new TreeService(repo.backend, repo.nodes, repo.sessions);
  });

  it("findBranchRoots 找到会话起点与孤儿根", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const session = await repo.sessions.create({ startNodeId: root.id });
    const orphan = await repo.nodes.createNode({ question: "孤儿" });
    const roots = await findBranchRoots(repo);
    expect(roots).toContain(root.id);
    expect(roots).toContain(orphan.id);
    expect(roots).toContain(session.startNodeId);
  });

  it("清理不活跃分支，保留活跃分支", async () => {
    const active = await repo.nodes.createNode({ question: "活跃" });
    const inactive = await repo.nodes.createNode({ question: "不活跃" });
    await ageNode(repo, inactive, 60);

    const result = await cleanupOnce(repo, 30);
    expect(result.branches).toBe(1);
    expect(result.nodes).toBe(1);
    expect(await repo.nodes.getNode(inactive.id)).toBeNull();
    expect(await repo.nodes.getNode(active.id)).not.toBeNull();
    expect(await repo.recycleBin.list()).toHaveLength(1);
  });

  it("受保护分支跳过（收藏/保留/分组/便签）", async () => {
    const kept = await repo.nodes.createNode({ question: "保留" });
    const child = await repo.nodes.createNode({ question: "子" });
    await repo.nodes.addEdge(kept.id, child.id);
    await repo.nodes.updateNode(child.id, { isKept: true });
    await ageNode(repo, kept, 60);
    await ageNode(repo, child, 60);

    const result = await cleanupOnce(repo, 30);
    expect(result.branches).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await repo.nodes.getNode(kept.id)).not.toBeNull();
  });

  it("分叉分支作为整体清理", async () => {
    const root = await repo.nodes.createNode({ question: "根" });
    const { node: b1 } = await service.createBranch(root.id, { name: "B1" });
    const child = await service.addChild(b1.id, { question: "继续" });
    // 整棵子树都 aging（子树内最新更新时间决定活跃度）
    await ageNode(repo, root, 60);
    await ageNode(repo, b1, 60);
    await ageNode(repo, child.node, 60);

    const result = await cleanupOnce(repo, 30);
    expect(result.branches).toBe(1); // 只清一次（根分支整体）
    expect(result.nodes).toBe(3); // 根+分支+子
    expect(await repo.nodes.getNode(root.id)).toBeNull();
    expect(await repo.nodes.getNode(b1.id)).toBeNull();
  });

  it("purgeExpired 物理删除过期节点", async () => {
    const n = await repo.nodes.createNode({ question: "过期" });
    await repo.nodes.softDeleteNode(n.id);
    // 直接插入过期记录
    await repo.backend.execute(
      `INSERT INTO recycle_bin (id, node_id, deleted_at, expires_at) VALUES (?, ?, ?, datetime('now', '-1 day'))`,
      ["r1", n.id, new Date().toISOString()]
    );
    const count = await purgeExpired(repo);
    expect(count).toBe(1);
    // 物理删除后节点表无该行
    const rows = await repo.backend.select<{ id: string }>(
      `SELECT id FROM nodes WHERE id = ?`,
      [n.id]
    );
    expect(rows).toHaveLength(0);
  });

  it("isBranchProtected 检测分组/便签", async () => {
    const n = await repo.nodes.createNode({ question: "x" });
    const g = await repo.groups.createGroup({ name: "g" });
    await repo.groups.addMembers(g.id, [n.id]);
    expect(await isBranchProtected(repo, [n.id])).toBe(true);
  });
});

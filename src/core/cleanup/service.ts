/**
 * 分支自动清理服务
 *
 * 规则：
 * - 检测"不活跃分支"（整个分支最后更新距今超过阈值天数）
 * - 分支 = 会话起点节点为根的整棵子树（含无父的根节点）
 * - 保护：分支内任一节点被收藏 / 保留 / 分组 / 便签关联 → 跳过
 * - 清理 = 软删除 + 移入回收站（保留30天，可恢复）
 * - 回收站过期项物理删除
 */
import type { AppRepositories } from "../db";
import { chunkArr, now } from "../db/util";

export interface CleanupResult {
  /** 清理的分支数 */
  branches: number;
  /** 清理的节点总数 */
  nodes: number;
  /** 因保护跳过的分支数 */
  skipped: number;
}

/**
 * 找出所有分支根（会话起点 + 无父根节点）
 * 去重：若某根是另一根的后代，只保留最上层的根（内存父链上溯，避免 O(n²) 数据库查询）
 */
export async function findBranchRoots(repos: AppRepositories): Promise<string[]> {
  const sessions = await repos.sessions.getAll();
  const roots = new Set(
    sessions.map((s) => s.startNodeId).filter(Boolean) as string[]
  );

  // 无父的根节点也视为分支根（孤儿树）
  const all = await repos.nodes.getAllActive();
  const edges = await repos.nodes.getAllActiveEdges();
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!parentsOf.has(e.childId)) parentsOf.set(e.childId, []);
    parentsOf.get(e.childId)!.push(e.parentId);
  }
  for (const n of all) {
    if ((parentsOf.get(n.id) ?? []).length === 0) roots.add(n.id);
  }

  const rootList = [...roots];
  const rootSet = new Set(rootList);
  const result: string[] = [];
  const memo = new Map<string, boolean>(); // id → 是否有 root 祖先
  const visiting = new Set<string>();

  const hasRootAncestor = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return false; // 环路保护（异常数据）
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    const found = parents.some(
      (p) => rootSet.has(p) || hasRootAncestor(p)
    );
    visiting.delete(id);
    memo.set(id, found);
    return found;
  };

  for (const r of rootList) {
    if (!hasRootAncestor(r)) result.push(r);
  }
  return result;
}

/**
 * 检查分支是否受保护（任一节点有收藏/保留/分组/便签）
 * 批量 COUNT 查询，避免逐节点 N+1
 */
export async function isBranchProtected(
  repos: AppRepositories,
  descendantIds: string[]
): Promise<boolean> {
  if (descendantIds.length === 0) return false;
  // 分块（SQLite 变量上限 999）
  for (const chunk of chunkArr(descendantIds, 300)) {
    const placeholders = chunk.map(() => "?").join(",");
    const kept = await repos.backend.select<{ c: number }>(
      `SELECT COUNT(*) AS c FROM nodes
       WHERE id IN (${placeholders}) AND (is_kept = 1 OR is_favorited = 1)`,
      chunk
    );
    if ((kept[0]?.c ?? 0) > 0) return true;
    const groups = await repos.backend.select<{ c: number }>(
      `SELECT COUNT(*) AS c FROM node_group_members WHERE node_id IN (${placeholders})`,
      chunk
    );
    if ((groups[0]?.c ?? 0) > 0) return true;
    const notes = await repos.backend.select<{ c: number }>(
      `SELECT COUNT(*) AS c FROM notes WHERE node_id IN (${placeholders})`,
      chunk
    );
    if ((notes[0]?.c ?? 0) > 0) return true;
  }
  return false;
}

/**
 * 获取分支最后活跃时间（子树内最新 updated_at）
 * 单条递归 CTE + MAX 查询
 */
export async function getBranchLastActive(
  repos: AppRepositories,
  rootId: string
): Promise<string | null> {
  const rows = await repos.backend.select<{ m: string | null }>(
    `WITH RECURSIVE subtree(id) AS (
       SELECT ?
       UNION ALL
       SELECT e.child_id FROM edges e JOIN subtree s ON e.parent_id = s.id
     )
     SELECT MAX(n.updated_at) AS m FROM nodes n
     JOIN subtree s ON n.id = s.id
     WHERE n.is_active = 1`,
    [rootId]
  );
  return rows[0]?.m ?? null;
}

/**
 * 执行一次清理
 * @param days 不活跃天数阈值
 */
export async function cleanupOnce(
  repos: AppRepositories,
  days: number
): Promise<CleanupResult> {
  const result: CleanupResult = { branches: 0, nodes: 0, skipped: 0 };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const roots = await findBranchRoots(repos);
  for (const rootId of roots) {
    const lastActive = await getBranchLastActive(repos, rootId);
    if (!lastActive) continue;
    if (new Date(lastActive).getTime() > cutoff) continue; // 仍活跃

    const descendantIds = await repos.nodes.getDescendantIds(rootId);
    // 保护检查：跳过整个分支
    if (await isBranchProtected(repos, descendantIds)) {
      result.skipped++;
      continue;
    }

    // 软删除 + 回收站（批量）
    await repos.nodes.softDeleteMany(descendantIds);
    await repos.recycleBin.addMany(descendantIds);
    result.branches++;
    result.nodes += descendantIds.length;
  }
  return result;
}

/**
 * 清理回收站过期项（超过保留期 → 物理删除）
 */
export async function purgeExpired(
  repos: AppRepositories
): Promise<number> {
  const expiredIds = await repos.recycleBin.purgeExpired();
  for (const id of expiredIds) {
    await repos.nodes.hardDeleteNode(id);
  }
  return expiredIds.length;
}

/** 生成 now（注入用，便于测试） */
export { now };

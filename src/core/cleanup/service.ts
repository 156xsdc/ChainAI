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
import { now } from "../db/util";

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
 */
export async function findBranchRoots(repos: AppRepositories): Promise<string[]> {
  const sessions = await repos.sessions.getAll();
  const roots = new Set(sessions.map((s) => s.startNodeId).filter(Boolean) as string[]);

  // 无父的根节点也视为分支根（孤儿树）
  const all = await repos.nodes.getAllActive();
  for (const n of all) {
    const parents = await repos.nodes.getParents(n.id);
    if (parents.length === 0) roots.add(n.id);
  }

  // 去重：若某根是另一根的后代，只保留最上层的根（避免重复清理）
  const rootList = [...roots];
  const result: string[] = [];
  for (const r of rootList) {
    let isDescendant = false;
    for (const o of rootList) {
      if (o === r) continue;
      const desc = await repos.nodes.getDescendantIds(o);
      if (desc.includes(r)) {
        isDescendant = true;
        break;
      }
    }
    if (!isDescendant) result.push(r);
  }
  return result;
}

/**
 * 检查分支是否受保护（任一节点有收藏/保留/分组/便签）
 */
export async function isBranchProtected(
  repos: AppRepositories,
  descendantIds: string[]
): Promise<boolean> {
  for (const id of descendantIds) {
    const node = await repos.nodes.getNode(id);
    if (!node) continue;
    if (node.isKept || node.isFavorited) return true;
    const groups = await repos.groups.getGroupsOfNode(id);
    if (groups.length > 0) return true;
    const notes = await repos.notes.listByNode(id);
    if (notes.length > 0) return true;
  }
  return false;
}

/**
 * 获取分支最后活跃时间（子树内最新 updated_at）
 */
export async function getBranchLastActive(
  repos: AppRepositories,
  rootId: string
): Promise<string | null> {
  const descendantIds = await repos.nodes.getDescendantIds(rootId);
  let latest: string | null = null;
  for (const id of descendantIds) {
    const node = await repos.nodes.getNode(id);
    if (node && (!latest || node.updatedAt > latest)) latest = node.updatedAt;
  }
  return latest;
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

    // 软删除 + 回收站
    for (const id of descendantIds) {
      await repos.nodes.softDeleteNode(id);
    }
    for (const id of descendantIds) {
      await repos.recycleBin.add(id);
    }
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

/**
 * 继承策略解析（唯一入口，替代 chatStore 里散落的 resolveInheritCount）
 *
 * 优先级：
 * 1. 分支会话（sessions.inherit_count）—— 沿父链找到最近的会话起点，
 *    所以分支的设置对整个分支子树持续生效
 * 2. 树策略（trees.inherit_mode / inherit_count）
 * 3. 全局默认（settings["ai.defaultInheritCount"]，默认 5）
 *
 * 数值语义：负数 = 全部继承；0 = 不继承；正数 = 最近 N 条**消息**
 * （一问一答算 2 条）
 */
import type { AppRepositories } from "../db";
import type { TreeService } from "../tree/treeService";

export type InheritMode = "all" | "count" | "none";

export interface InheritPolicy {
  mode: InheritMode;
  /** mode=count 时的消息条数 */
  count: number;
}

export const DEFAULT_INHERIT_COUNT = 5;

/** 会话/树里的数值 → 统一策略 */
export function policyFromCount(value: number | null | undefined): InheritPolicy {
  if (value === null || value === undefined) {
    return { mode: "count", count: DEFAULT_INHERIT_COUNT };
  }
  if (value < 0) return { mode: "all", count: 0 };
  if (value === 0) return { mode: "none", count: 0 };
  return { mode: "count", count: value };
}

/** 统一策略 → 会话/树的数值表示 */
export function policyToCount(policy: InheritPolicy): number {
  if (policy.mode === "all") return -1;
  if (policy.mode === "none") return 0;
  return Math.max(1, policy.count);
}

export interface PolicyDeps {
  repos: AppRepositories;
  treeService: TreeService;
  currentTreeId: string | null;
}

/** 解析某个节点这次发送要用的继承策略 */
export async function resolveInheritPolicy(
  deps: PolicyDeps,
  nodeId: string | null
): Promise<InheritPolicy> {
  const { repos, treeService, currentTreeId } = deps;

  // 1. 分支会话优先
  if (nodeId) {
    const session = await treeService.getSessionForNode(nodeId);
    if (session && session.inheritCount !== null && session.inheritCount !== undefined) {
      return policyFromCount(session.inheritCount);
    }
  }

  // 2. 树策略
  const tree = currentTreeId ? await repos.trees.getById(currentTreeId) : null;
  if (tree) {
    if (tree.inheritMode === "all") return { mode: "all", count: 0 };
    if (tree.inheritMode === "none") return { mode: "none", count: 0 };
    return { mode: "count", count: Math.max(1, tree.inheritCount) };
  }

  // 3. 全局默认
  const fallback = await repos.settings.get<number>(
    "ai.defaultInheritCount",
    DEFAULT_INHERIT_COUNT
  );
  return policyFromCount(fallback);
}

export interface CompressionSettings {
  enabled: boolean;
  /** 最近几条完整保留（消息条数） */
  recentKeep: number;
}

/** 读取时间权重压缩设置 */
export async function loadCompressionSettings(
  repos: AppRepositories
): Promise<CompressionSettings> {
  const raw = await repos.settings.get<{ enabled?: boolean; recentKeep?: number }>(
    "ai.contextCompression",
    { enabled: true, recentKeep: 5 }
  );
  return {
    enabled: raw.enabled !== false,
    recentKeep: Math.max(1, raw.recentKeep ?? 5),
  };
}

/**
 * 分支显示名：会话名（分支命名）> 节点摘要 > 问题截断 > 默认
 */
import type { AppRepositories, TreeNode } from "../db";

export async function getBranchLabel(
  repos: AppRepositories,
  node: TreeNode
): Promise<string> {
  const sess = await repos.sessions.getByStartNode(node.id);
  if (sess?.name) return sess.name;
  if (node.summary) return node.summary;
  if (node.question) return node.question.slice(0, 14);
  return "未命名分支";
}

/**
 * Markdown 导入导出（可读文档）
 *
 * 导出：标题层级 = 树深度（# 根 → ## 子分支 → ### 孙...）
 * 导入：解析标题层级重建树结构（标题=用户问题，正文=AI回答）
 */
import type { AppRepositories, TreeNode } from "../db";

const MAX_LEVEL = 6;

// ================= 导出 =================

/**
 * 导出整棵子树为 Markdown 文档
 * @param rootId 根节点（含自身）
 */
export async function exportTreeToMarkdown(
  repos: AppRepositories,
  rootId: string
): Promise<string> {
  const { nodes, edges } = await repos.nodes.getSubtree(rootId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.parentId)) childrenOf.set(e.parentId, []);
    childrenOf.get(e.parentId)!.push(e.childId);
  }
  const root = byId.get(rootId);
  if (!root) return "";

  const lines: string[] = [];
  const visit = (node: TreeNode, depth: number) => {
    const level = Math.min(depth + 1, MAX_LEVEL);
    lines.push(`${"#".repeat(level)} ${node.question || "（无问题）"}`);
    if (node.answer) {
      lines.push("");
      lines.push(node.answer.trim());
      lines.push("");
    }
    const kids = (childrenOf.get(node.id) ?? []).map((id) => byId.get(id));
    for (const kid of kids) {
      if (kid) visit(kid, depth + 1);
    }
  };
  visit(root, 0);
  return lines.join("\n").trim() + "\n";
}

// ================= 导入 =================

export interface ParsedMarkdownNode {
  question: string;
  answer: string;
  level: number;
}

/** 解析 Markdown 为标题层级结构 */
export function parseMarkdownTree(text: string): ParsedMarkdownNode[] {
  const lines = text.split(/\r?\n/);
  const result: ParsedMarkdownNode[] = [];
  let current: ParsedMarkdownNode | null = null;

  for (const raw of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(raw);
    if (m) {
      current = {
        question: m[2].trim(),
        answer: "",
        level: m[1].length,
      };
      result.push(current);
    } else if (current) {
      const trimmed = raw.trim();
      if (trimmed) {
        current.answer += (current.answer ? "\n" : "") + raw;
      }
    }
  }
  return result;
}

/**
 * 导入 Markdown：按标题层级重建树（追加到现有数据，不覆盖）
 * @returns 新建的根节点
 */
export async function importMarkdownAsTree(
  repos: AppRepositories,
  text: string
): Promise<TreeNode | null> {
  const parsed = parseMarkdownTree(text);
  if (parsed.length === 0) return null;

  // 栈：保存 [level, nodeId]
  const stack: Array<{ level: number; nodeId: string }> = [];
  let root: TreeNode | null = null;

  for (const item of parsed) {
    let node: TreeNode;
    if (stack.length === 0) {
      // 第一个标题 = 根
      node = await repos.nodes.createNode({ question: item.question });
      root = node;
    } else {
      // 弹栈到父层级：父 = level 严格小于当前 level 的最近栈项
      while (
        stack.length > 0 &&
        stack[stack.length - 1].level >= item.level
      ) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      if (parent) {
        const created = await repos.nodes.createNode({ question: item.question });
        await repos.nodes.addEdge(parent.nodeId, created.id, "inherit");
        node = created;
      } else {
        node = await repos.nodes.createNode({ question: item.question });
        if (!root) root = node;
      }
    }
    if (item.answer.trim()) {
      await repos.nodes.updateNode(node.id, { answer: item.answer.trim() });
    }
    stack.push({ level: item.level, nodeId: node.id });
  }

  return root;
}

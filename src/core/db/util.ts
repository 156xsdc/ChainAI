/** 数据库工具：ID 生成与行映射 */
import type {
  EdgeRow,
  NodeRow,
  SessionRow,
  TreeEdge,
  TreeNode,
} from "./types";

export function newId(): string {
  return crypto.randomUUID();
}

/** 数组分块（用于批量 SQL 参数，避免超过 SQLite 999 变量上限） */
export function chunkArr<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function now(): string {
  return new Date().toISOString();
}

export function rowToNode(row: NodeRow): TreeNode {
  return {
    id: row.id,
    treeId: row.tree_id ?? null,
    question: row.question,
    answer: row.answer,
    type: row.type,
    summary: row.summary,
    color: row.color,
    isKept: row.is_kept === 1,
    isFavorited: row.is_favorited === 1,
    isActive: row.is_active === 1,
    answerVersion: row.answer_version ?? 1,
    quote: row.quote ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToEdge(row: EdgeRow): TreeEdge {
  return {
    id: row.id,
    parentId: row.parent_id,
    childId: row.child_id,
    relationType: row.relation_type,
    createdAt: row.created_at,
  };
}

export function rowToSession(row: SessionRow) {
  return {
    id: row.id,
    name: row.name,
    startNodeId: row.start_node_id,
    parentId: row.parent_id,
    inheritCount: row.inherit_count,
    createdAt: row.created_at,
    isActive: row.is_active === 1,
  };
}

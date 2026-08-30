/**
 * 节点仓库：nodes + edges 的 CRUD 与树结构查询
 * 支持 DAG：多父节点（合并）、实线/虚线（继承/不继承）
 */
import type { SqlBackend } from "../backend";
import { newId, now, rowToEdge, rowToNode } from "../util";
import type {
  NodeRow,
  NodeType,
  RelationType,
  TreeEdge,
  TreeNode,
} from "../types";

export interface CreateNodeInput {
  question?: string;
  answer?: string;
  type?: NodeType;
  summary?: string;
  color?: string;
  /** 所属树（默认 null = 迁移兼容） */
  treeId?: string | null;
}

export interface EdgeWithParent extends TreeEdge {
  parent: TreeNode;
}

/** 路径段：从根到目标节点的每一步 */
export interface PathSegment {
  node: TreeNode;
  /** 进入该节点时的边关系（根节点为 null） */
  relationType: RelationType | null;
  edgeId: string | null;
}

export class NodeRepository {
  constructor(private readonly db: SqlBackend) {}

  // ================= 节点 CRUD =================

  async createNode(input: CreateNodeInput = {}): Promise<TreeNode> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO nodes (id, tree_id, question, answer, type, summary, color, is_kept, is_favorited, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`,
      [
        id,
        input.treeId ?? null,
        input.question ?? "",
        input.answer ?? "",
        input.type ?? "normal",
        input.summary ?? "",
        input.color ?? "#333333",
        ts,
        ts,
      ]
    );
    const row = await this.getRow(id);
    if (!row) throw new Error("创建节点失败");
    return rowToNode(row);
  }

  async getNode(id: string): Promise<TreeNode | null> {
    const row = await this.getRow(id);
    return row ? rowToNode(row) : null;
  }

  private async getRow(id: string): Promise<NodeRow | null> {
    const rows = await this.db.select<NodeRow>(
      `SELECT * FROM nodes WHERE id = ? AND is_active = 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async updateNode(
    id: string,
    patch: Partial<
      Pick<TreeNode, "question" | "answer" | "summary" | "color" | "type">
    > & { isKept?: boolean; isFavorited?: boolean }
  ): Promise<TreeNode | null> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (patch.question !== undefined) {
      sets.push("question = ?");
      params.push(patch.question);
    }
    if (patch.answer !== undefined) {
      sets.push("answer = ?");
      params.push(patch.answer);
    }
    if (patch.summary !== undefined) {
      sets.push("summary = ?");
      params.push(patch.summary);
    }
    if (patch.color !== undefined) {
      sets.push("color = ?");
      params.push(patch.color);
    }
    if (patch.type !== undefined) {
      sets.push("type = ?");
      params.push(patch.type);
    }
    if (patch.isKept !== undefined) {
      sets.push("is_kept = ?");
      params.push(patch.isKept ? 1 : 0);
    }
    if (patch.isFavorited !== undefined) {
      sets.push("is_favorited = ?");
      params.push(patch.isFavorited ? 1 : 0);
    }

    if (sets.length === 0) return this.getNode(id);

    sets.push("updated_at = ?");
    params.push(now());
    params.push(id);

    await this.db.execute(
      `UPDATE nodes SET ${sets.join(", ")} WHERE id = ? AND is_active = 1`,
      params
    );
    return this.getNode(id);
  }

  /** 软删除：置 is_active = 0（回收站可恢复） */
  async softDeleteNode(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE nodes SET is_active = 0, updated_at = ? WHERE id = ?`,
      [now(), id]
    );
  }

  /** 物理删除：彻底移除节点（边/收藏等依赖级联处理） */
  async hardDeleteNode(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM nodes WHERE id = ?`, [id]);
  }

  // ================= 边 CRUD =================

  async addEdge(
    parentId: string,
    childId: string,
    relationType: RelationType = "inherit"
  ): Promise<TreeEdge | null> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT OR IGNORE INTO edges (id, parent_id, child_id, relation_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, parentId, childId, relationType, ts]
    );
    const rows = await this.db.select<import("../types").EdgeRow>(
      `SELECT * FROM edges WHERE parent_id = ? AND child_id = ?`,
      [parentId, childId]
    );
    return rows[0] ? rowToEdge(rows[0]) : null;
  }

  async removeEdge(parentId: string, childId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM edges WHERE parent_id = ? AND child_id = ?`,
      [parentId, childId]
    );
  }

  // ================= 树查询 =================

  /** 子节点列表（按创建时间升序） */
  async getChildren(nodeId: string): Promise<TreeNode[]> {
    const rows = await this.db.select<NodeRow>(
      `SELECT n.* FROM nodes n
       JOIN edges e ON e.child_id = n.id
       WHERE e.parent_id = ? AND n.is_active = 1
       ORDER BY n.created_at ASC, n.rowid ASC`,
      [nodeId]
    );
    return rows.map(rowToNode);
  }

  /** 子节点 + 边关系 */
  async getChildrenWithEdge(nodeId: string): Promise<
    Array<{ node: TreeNode; edge: TreeEdge }>
  > {
    const rows = await this.db.select<
      NodeRow & { edge_id: string; relation_type: RelationType; edge_created_at: string }
    >(
      `SELECT n.*, e.id AS edge_id, e.relation_type, e.created_at AS edge_created_at
       FROM nodes n
       JOIN edges e ON e.child_id = n.id
       WHERE e.parent_id = ? AND n.is_active = 1
       ORDER BY n.created_at ASC, n.rowid ASC`,
      [nodeId]
    );
    return rows.map((r) => ({
      node: rowToNode(r),
      edge: {
        id: r.edge_id,
        parentId: nodeId,
        childId: r.id,
        relationType: r.relation_type,
        createdAt: r.edge_created_at,
      },
    }));
  }

  /** 父节点列表（DAG 多父） */
  async getParents(nodeId: string): Promise<TreeNode[]> {
    const rows = await this.db.select<NodeRow>(
      `SELECT n.* FROM nodes n
       JOIN edges e ON e.parent_id = n.id
       WHERE e.child_id = ? AND n.is_active = 1
       ORDER BY n.created_at ASC, n.rowid ASC`,
      [nodeId]
    );
    return rows.map(rowToNode);
  }

  /** 父节点 + 边信息 */
  async getParentsWithEdge(nodeId: string): Promise<EdgeWithParent[]> {
    const rows = await this.db.select<
      NodeRow & { edge_id: string; relation_type: RelationType }
    >(
      `SELECT n.*, e.id AS edge_id, e.relation_type
       FROM nodes n
       JOIN edges e ON e.parent_id = n.id
       WHERE e.child_id = ? AND n.is_active = 1
       ORDER BY n.created_at ASC, n.rowid ASC`,
      [nodeId]
    );
    return rows.map((r) => ({
      ...{
        id: r.edge_id,
        parentId: r.id,
        childId: nodeId,
        relationType: r.relation_type,
        createdAt: r.created_at,
      },
      parent: rowToNode(r),
    }));
  }

  /** 沿主父链回溯，返回从根到当前节点的路径（含当前节点） */
  async getPathToRoot(nodeId: string): Promise<PathSegment[]> {
    const segments: PathSegment[] = [];
    let current = nodeId;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      visited.add(current);
      const row = await this.getRow(current);
      if (!row) break;
      const parentLinks = await this.getParentsWithEdge(current);
      segments.push({
        node: rowToNode(row),
        relationType: parentLinks[0]?.relationType ?? null,
        edgeId: parentLinks[0]?.id ?? null,
      });
      if (parentLinks.length === 0) break;
      current = parentLinks[0].parent.id;
    }
    return segments.reverse();
  }

  /** 当前节点的所有可达祖先（DAG 全路径展开，去重，不含自身） */
  async getAncestors(nodeId: string): Promise<TreeNode[]> {
    const rows = await this.db.select<NodeRow>(
      `WITH RECURSIVE ancestry(id) AS (
         SELECT e.parent_id FROM edges e WHERE e.child_id = ?
         UNION
         SELECT e.parent_id FROM edges e
         JOIN ancestry a ON e.child_id = a.id
       )
       SELECT DISTINCT n.* FROM nodes n JOIN ancestry a ON n.id = a.id
       WHERE n.is_active = 1`,
      [nodeId]
    );
    return rows.map(rowToNode);
  }

  /** 后代节点集合（含自身） */
  async getDescendantIds(rootId: string): Promise<string[]> {
    const rows = await this.db.select<{ id: string }>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT ?
         UNION ALL
         SELECT e.child_id FROM edges e JOIN subtree s ON e.parent_id = s.id
       )
       SELECT id FROM subtree`,
      [rootId]
    );
    return rows.map((r) => r.id);
  }

  /** 子树（节点 + 子树内部边） */
  async getSubtree(rootId: string): Promise<{
    nodes: TreeNode[];
    edges: TreeEdge[];
  }> {
    const nodeRows = await this.db.select<NodeRow>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT ?
         UNION ALL
         SELECT e.child_id FROM edges e JOIN subtree s ON e.parent_id = s.id
       )
       SELECT n.* FROM nodes n JOIN subtree s ON n.id = s.id
       WHERE n.is_active = 1`,
      [rootId]
    );
    const ids = nodeRows.map((r) => r.id);
    let edges: TreeEdge[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const edgeRows = await this.db.select<import("../types").EdgeRow>(
        `SELECT * FROM edges
         WHERE parent_id IN (${placeholders}) AND child_id IN (${placeholders})
         ORDER BY created_at ASC, rowid ASC`,
        [...ids, ...ids]
      );
      edges = edgeRows.map(rowToEdge);
    }
    return { nodes: nodeRows.map(rowToNode), edges };
  }

  /** 全部活跃节点（可限定树） */
  async getAllActive(treeId?: string | null): Promise<TreeNode[]> {
    const rows = treeId
      ? await this.db.select<NodeRow>(
          `SELECT * FROM nodes WHERE is_active = 1 AND tree_id = ? ORDER BY created_at ASC, rowid ASC`,
          [treeId]
        )
      : await this.db.select<NodeRow>(
          `SELECT * FROM nodes WHERE is_active = 1 ORDER BY created_at ASC, rowid ASC`
        );
    return rows.map(rowToNode);
  }

  /** 关键词搜索节点（问题/回答/摘要），按更新时间倒序（可限定树） */
  async search(keyword: string, limit = 50, treeId?: string | null): Promise<TreeNode[]> {
    const like = `%${keyword}%`;
    const rows = treeId
      ? await this.db.select<NodeRow>(
          `SELECT * FROM nodes
           WHERE is_active = 1 AND tree_id = ? AND (question LIKE ? OR answer LIKE ? OR summary LIKE ?)
           ORDER BY updated_at DESC, rowid DESC
           LIMIT ?`,
          [treeId, like, like, like, limit]
        )
      : await this.db.select<NodeRow>(
          `SELECT * FROM nodes
           WHERE is_active = 1 AND (question LIKE ? OR answer LIKE ? OR summary LIKE ?)
           ORDER BY updated_at DESC, rowid DESC
           LIMIT ?`,
          [like, like, like, limit]
        );
    return rows.map(rowToNode);
  }

  /** 全部活跃节点之间的边（可限定树） */
  async getAllActiveEdges(treeId?: string | null): Promise<TreeEdge[]> {
    const rows = treeId
      ? await this.db.select<import("../types").EdgeRow>(
          `SELECT DISTINCT e.* FROM edges e
           JOIN nodes p ON p.id = e.parent_id
           JOIN nodes c ON c.id = e.child_id
           WHERE p.is_active = 1 AND c.is_active = 1 AND p.tree_id = ? AND c.tree_id = ?
           ORDER BY e.created_at ASC, e.rowid ASC`,
          [treeId, treeId]
        )
      : await this.db.select<import("../types").EdgeRow>(
          `SELECT DISTINCT e.* FROM edges e
           JOIN nodes p ON p.id = e.parent_id
           JOIN nodes c ON c.id = e.child_id
           WHERE p.is_active = 1 AND c.is_active = 1
           ORDER BY e.created_at ASC, e.rowid ASC`
        );
    return rows.map(rowToEdge);
  }
}

/** 节点分组仓库：node_groups + node_group_members（虚线框分组，支持嵌套） */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";
import type { NodeGroup } from "../types";

/** node_groups 表行（原始） */
interface GroupRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  summary: string;
  parent_id: string | null;
  collapsed: number;
  created_at: string;
}

export class GroupRepository {
  constructor(private readonly db: SqlBackend) {}

  // ---------- 分组 ----------

  async createGroup(input: {
    name?: string;
    color?: string;
    icon?: string;
    parentId?: string | null;
  }): Promise<NodeGroup> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO node_groups (id, name, color, icon, summary, parent_id, collapsed, created_at)
       VALUES (?, ?, ?, ?, '', ?, 0, ?)`,
      [
        id,
        input.name ?? "",
        input.color ?? "#dcdcdc",
        input.icon ?? "",
        input.parentId ?? null,
        ts,
      ]
    );
    return (await this.getGroup(id))!;
  }

  async getGroup(id: string): Promise<NodeGroup | null> {
    const rows = await this.db.select<GroupRow>(
      `SELECT * FROM node_groups WHERE id = ?`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      summary: r.summary,
      parentId: r.parent_id,
      collapsed: r.collapsed === 1,
      createdAt: r.created_at,
    };
  }

  async updateGroup(
    id: string,
    patch: Partial<
      Pick<NodeGroup, "name" | "color" | "icon" | "summary" | "collapsed">
    >
  ): Promise<NodeGroup | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.color !== undefined) {
      sets.push("color = ?");
      params.push(patch.color);
    }
    if (patch.icon !== undefined) {
      sets.push("icon = ?");
      params.push(patch.icon);
    }
    if (patch.summary !== undefined) {
      sets.push("summary = ?");
      params.push(patch.summary);
    }
    if (patch.collapsed !== undefined) {
      sets.push("collapsed = ?");
      params.push(patch.collapsed ? 1 : 0);
    }
    if (sets.length === 0) return this.getGroup(id);
    params.push(id);
    await this.db.execute(
      `UPDATE node_groups SET ${sets.join(", ")} WHERE id = ?`,
      params
    );
    return this.getGroup(id);
  }

  async deleteGroup(id: string): Promise<void> {
    // 级联删除成员；子分组通过 ON DELETE CASCADE 处理
    await this.db.execute(`DELETE FROM node_groups WHERE id = ?`, [id]);
  }

  async listGroups(): Promise<NodeGroup[]> {
    const rows = await this.db.select<GroupRow>(
      `SELECT * FROM node_groups ORDER BY created_at ASC, rowid ASC`
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      summary: r.summary,
      parentId: r.parent_id,
      collapsed: r.collapsed === 1,
      createdAt: r.created_at,
    }));
  }

  // ---------- 成员 ----------

  async addMembers(groupId: string, nodeIds: string[]): Promise<void> {
    const stmt = `INSERT OR IGNORE INTO node_group_members (group_id, node_id) VALUES (?, ?)`;
    for (const nodeId of nodeIds) {
      await this.db.execute(stmt, [groupId, nodeId]);
    }
  }

  async removeMember(groupId: string, nodeId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM node_group_members WHERE group_id = ? AND node_id = ?`,
      [groupId, nodeId]
    );
  }

  async getMemberIds(groupId: string): Promise<string[]> {
    const rows = await this.db.select<{ node_id: string }>(
      `SELECT node_id FROM node_group_members WHERE group_id = ?`,
      [groupId]
    );
    return rows.map((r) => r.node_id);
  }

  /** 节点所属的所有分组 */
  async getGroupsOfNode(nodeId: string): Promise<string[]> {
    const rows = await this.db.select<{ group_id: string }>(
      `SELECT group_id FROM node_group_members WHERE node_id = ?`,
      [nodeId]
    );
    return rows.map((r) => r.group_id);
  }
}

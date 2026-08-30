/** 收藏仓库：favorites + favorite_groups */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";
import type { Favorite, FavoriteGroup } from "../types";

export class FavoriteRepository {
  constructor(private readonly db: SqlBackend) {}

  // ---------- 收藏项 ----------

  async add(nodeId: string, groupId?: string | null, note = ""): Promise<Favorite> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT OR IGNORE INTO favorites (id, node_id, group_id, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, nodeId, groupId ?? null, note, ts]
    );
    const rows = await this.db.select<import("../types").FavoriteRow>(
      `SELECT * FROM favorites WHERE node_id = ?`,
      [nodeId]
    );
    const row = rows[0];
    return {
      id: row.id,
      nodeId: row.node_id,
      groupId: row.group_id,
      note: row.note,
      createdAt: row.created_at,
    };
  }

  async remove(nodeId: string): Promise<void> {
    await this.db.execute(`DELETE FROM favorites WHERE node_id = ?`, [nodeId]);
  }

  async removeById(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM favorites WHERE id = ?`, [id]);
  }

  async isFavorited(nodeId: string): Promise<boolean> {
    const rows = await this.db.select<{ c: number }>(
      `SELECT COUNT(*) AS c FROM favorites WHERE node_id = ?`,
      [nodeId]
    );
    return (rows[0]?.c ?? 0) > 0;
  }

  async updateNote(id: string, note: string): Promise<void> {
    await this.db.execute(`UPDATE favorites SET note = ? WHERE id = ?`, [
      note,
      id,
    ]);
  }

  async moveToGroup(id: string, groupId: string | null): Promise<void> {
    await this.db.execute(
      `UPDATE favorites SET group_id = ? WHERE id = ?`,
      [groupId, id]
    );
  }

  async getAll(): Promise<Favorite[]> {
    const rows = await this.db.select<import("../types").FavoriteRow>(
      `SELECT * FROM favorites ORDER BY created_at DESC, rowid DESC`
    );
    return rows.map((r) => ({
      id: r.id,
      nodeId: r.node_id,
      groupId: r.group_id,
      note: r.note,
      createdAt: r.created_at,
    }));
  }

  // ---------- 收藏分组 ----------

  async createGroup(name: string, color = "#333333", icon = ""): Promise<FavoriteGroup> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO favorite_groups (id, name, color, icon, sort_order, created_at)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM favorite_groups), ?)`,
      [id, name, color, icon, ts]
    );
    return (await this.getGroup(id))!;
  }

  async getGroup(id: string): Promise<FavoriteGroup | null> {
    const rows = await this.db.select<import("../types").FavoriteRow & { name: string; color: string; icon: string; sort_order: number }>(
      `SELECT * FROM favorite_groups WHERE id = ?`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    };
  }

  /** 删除分组（组内收藏自动移到未分组，ON DELETE SET NULL） */
  async deleteGroup(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM favorite_groups WHERE id = ?`, [id]);
  }

  async listGroups(): Promise<FavoriteGroup[]> {
    const rows = await this.db.select<{
      id: string;
      name: string;
      color: string;
      icon: string;
      sort_order: number;
      created_at: string;
    }>(`SELECT * FROM favorite_groups ORDER BY sort_order ASC`);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    }));
  }
}

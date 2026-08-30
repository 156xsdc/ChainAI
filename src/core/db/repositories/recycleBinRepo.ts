/**
 * 回收站仓库：软删除记录（默认保留30天，自动清理逻辑后续接入）
 */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";
import type { RecycleBinRow } from "../types";

export class RecycleBinRepository {
  constructor(private readonly db: SqlBackend) {}

  /** 记录被删除的节点（软删除本身由调用方执行） */
  async add(nodeId: string, sessionId?: string | null): Promise<void> {
    await this.db.execute(
      `INSERT INTO recycle_bin (id, node_id, session_id, deleted_at, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '+30 days'))`,
      [newId(), nodeId, sessionId ?? null, now()]
    );
  }

  /** 恢复节点：重新激活 + 移除回收站记录 */
  async restore(nodeId: string): Promise<void> {
    await this.db.execute(
      `UPDATE nodes SET is_active = 1, updated_at = ? WHERE id = ?`,
      [now(), nodeId]
    );
    await this.db.execute(`DELETE FROM recycle_bin WHERE node_id = ?`, [nodeId]);
  }

  async list(): Promise<RecycleBinRow[]> {
    return this.db.select<RecycleBinRow>(
      `SELECT * FROM recycle_bin ORDER BY deleted_at DESC`
    );
  }

  async remove(nodeId: string): Promise<void> {
    await this.db.execute(`DELETE FROM recycle_bin WHERE node_id = ?`, [nodeId]);
  }

  /** 彻底删除过期记录（返回删除的节点ID） */
  async purgeExpired(): Promise<string[]> {
    const rows = await this.db.select<{ node_id: string }>(
      `SELECT node_id FROM recycle_bin WHERE expires_at <= datetime('now')`
    );
    const ids = rows.map((r) => r.node_id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      await this.db.execute(
        `DELETE FROM recycle_bin WHERE node_id IN (${placeholders})`,
        ids
      );
    }
    return ids;
  }
}

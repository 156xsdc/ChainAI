/**
 * 回收站仓库：软删除记录（默认保留30天，自动清理逻辑后续接入）
 */
import type { SqlBackend } from "../backend";
import { chunkArr, newId, now } from "../util";
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

  /** 批量记录（分块，避免超过 SQLite 999 变量上限） */
  async addMany(nodeIds: string[]): Promise<void> {
    const ts = now();
    for (const chunk of chunkArr(nodeIds, 200)) {
      const rows = chunk
        .map(() => "(?, ?, NULL, ?, datetime('now', '+30 days'))")
        .join(",");
      const params = chunk.flatMap((id) => [newId(), id, ts]);
      await this.db.execute(
        `INSERT INTO recycle_bin (id, node_id, session_id, deleted_at, expires_at)
         VALUES ${rows}`,
        params
      );
    }
  }

  /**
   * 恢复节点及其全部后代（整棵子树）：重新激活 + 移除回收站记录
   * 与 deleteBranch 的"软删除整棵子树"对称，避免恢复中间节点产生孤儿
   */
  async restore(nodeId: string): Promise<void> {
    const descendants = await this.db.select<{ id: string }>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT ?
         UNION ALL
         SELECT e.child_id FROM edges e JOIN subtree s ON e.parent_id = s.id
       )
       SELECT id FROM subtree`,
      [nodeId]
    );
    const ids = descendants.map((r) => r.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      await this.db.execute(
        `UPDATE nodes SET is_active = 1, updated_at = ? WHERE id IN (${placeholders}) AND is_active = 0`,
        [now(), ...ids]
      );
      await this.db.execute(
        `DELETE FROM recycle_bin WHERE node_id IN (${placeholders})`,
        ids
      );
    }
  }

  async list(): Promise<RecycleBinRow[]> {
    return this.db.select<RecycleBinRow>(
      `SELECT * FROM recycle_bin ORDER BY deleted_at DESC`
    );
  }

  /** 回收站列表 + 节点问题（单次 JOIN，替代逐条查询） */
  async listWithQuestions(): Promise<Array<RecycleBinRow & { question: string }>> {
    return this.db.select<RecycleBinRow & { question: string }>(
      `SELECT rb.*, COALESCE(n.question, '') AS question
       FROM recycle_bin rb LEFT JOIN nodes n ON n.id = rb.node_id
       ORDER BY rb.deleted_at DESC`
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

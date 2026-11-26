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
  async restore(
    nodeId: string
  ): Promise<{ restoredNodes: number; newTrees: Array<{ id: string; name: string }> }> {
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
    const newTrees: Array<{ id: string; name: string }> = [];
    if (ids.length === 0) return { restoredNodes: 0, newTrees };

    const placeholders = ids.map(() => "?").join(",");
    await this.db.execute(
      `UPDATE nodes SET is_active = 1, updated_at = ? WHERE id IN (${placeholders}) AND is_active = 0`,
      [now(), ...ids]
    );

    // 所属树已被删除的孤儿节点：用「该节点的问题」新建一棵树挂上去，
    // 否则恢复后「哪里都看不到」（树状图按树过滤）。
    // 同一棵原树恢复出来的节点归到同一棵新树（按原 tree_id 分组）。
    const orphans = await this.db.select<{
      id: string;
      tree_id: string;
      question: string;
    }>(
      `SELECT n.id, n.tree_id, n.question
         FROM nodes n
        WHERE n.id IN (${placeholders})
          AND n.tree_id IS NOT NULL
          AND n.tree_id NOT IN (SELECT id FROM trees)
        ORDER BY n.created_at ASC, n.rowid ASC`,
      ids
    );

    if (orphans.length > 0) {
      const groups = new Map<string, { ids: string[]; name: string }>();
      for (const row of orphans) {
        const g = groups.get(row.tree_id);
        if (g) {
          g.ids.push(row.id);
        } else {
          // 组内最早的那个节点的提问作为树名
          groups.set(row.tree_id, {
            ids: [row.id],
            name: questionToTreeName(row.question),
          });
        }
      }
      const usedNames = new Set(
        (await this.db.select<{ name: string }>(`SELECT name FROM trees`)).map(
          (r) => r.name
        )
      );
      for (const group of groups.values()) {
        const name = uniqueTreeName(group.name, usedNames);
        const treeId = newId();
        await this.db.execute(
          `INSERT INTO trees (id, name, inherit_mode, inherit_count, created_at)
           VALUES (?, ?, 'count', ?, ?)`,
          [treeId, name, await this.defaultInheritCount(), now()]
        );
        const ph = group.ids.map(() => "?").join(",");
        await this.db.execute(
          `UPDATE nodes SET tree_id = ?, updated_at = ? WHERE id IN (${ph})`,
          [treeId, now(), ...group.ids]
        );
        newTrees.push({ id: treeId, name });
      }
    }

    await this.db.execute(
      `DELETE FROM recycle_bin WHERE node_id IN (${placeholders})`,
      ids
    );
    return { restoredNodes: ids.length, newTrees };
  }

  /** 读全局默认继承条数（新树的上下文策略） */
  private async defaultInheritCount(): Promise<number> {
    try {
      const rows = await this.db.select<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'ai.defaultInheritCount'`
      );
      const parsed = rows[0] ? Number(JSON.parse(rows[0].value)) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
    } catch {
      return 5;
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

/** 用提问生成树名：压平空白、截断 20 字；空提问回退「恢复的树」 */
function questionToTreeName(question: string): string {
  const flat = (question ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "恢复的树";
  return flat.length > 20 ? `${flat.slice(0, 20)}…` : flat;
}

/** 树名去重：重名追加 (2) (3)… */
function uniqueTreeName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base} (${i})`)) i++;
  const next = `${base} (${i})`;
  used.add(next);
  return next;
}

/**
 * 树仓库：多棵树（每个树是独立的对话项目）
 */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";

export interface Tree {
  id: string;
  name: string;
  createdAt: string;
}

export class TreeRepository {
  constructor(private readonly db: SqlBackend) {}

  async create(name = "新树"): Promise<Tree> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO trees (id, name, created_at) VALUES (?, ?, ?)`,
      [id, name, ts]
    );
    return { id, name, createdAt: ts };
  }

  async list(): Promise<Tree[]> {
    const rows = await this.db.select<{
      id: string;
      name: string;
      created_at: string;
    }>(`SELECT * FROM trees ORDER BY created_at ASC, rowid ASC`);
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  async getById(id: string): Promise<Tree | null> {
    const rows = await this.db.select<{
      id: string;
      name: string;
      created_at: string;
    }>(`SELECT * FROM trees WHERE id = ?`, [id]);
    return rows[0]
      ? { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at }
      : null;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db.execute(`UPDATE trees SET name = ? WHERE id = ?`, [name, id]);
  }

  /** 删除树（节点由调用方处理：软删除 + 回收站） */
  async remove(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM trees WHERE id = ?`, [id]);
  }
}

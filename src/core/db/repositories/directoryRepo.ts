/**
 * 便签目录仓库：持久化目录（独立于便签，删除便签不删目录）
 * path 为相对路径（"项目A/子项目"），"" 表示根目录（不存储）
 */
import type { SqlBackend } from "../backend";
import { newId } from "../util";

export class DirectoryRepository {
  constructor(private readonly db: SqlBackend) {}

  /** 确保目录存在（幂等） */
  async ensure(path: string): Promise<void> {
    const p = path.trim();
    if (!p) return;
    // 逐级确保父目录
    const parts = p.split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      await this.db.execute(
        `INSERT OR IGNORE INTO directories (id, path) VALUES (?, ?)`,
        [newId(), cur]
      );
    }
  }

  /** 全部目录路径 */
  async list(): Promise<string[]> {
    const rows = await this.db.select<{ path: string }>(
      `SELECT path FROM directories ORDER BY path ASC`
    );
    return rows.map((r) => r.path);
  }

  /** 删除目录及其所有子目录 */
  async remove(path: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM directories WHERE path = ? OR path LIKE ?`,
      [path, `${path}/%`]
    );
  }
}

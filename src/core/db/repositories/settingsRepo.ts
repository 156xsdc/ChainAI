/** 设置仓库：key-value，value 为 JSON */
import type { SqlBackend } from "../backend";

export class SettingsRepository {
  constructor(private readonly db: SqlBackend) {}

  async get<T = unknown>(key: string, defaultValue: T): Promise<T> {
    const rows = await this.db.select<{ value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
      [key]
    );
    if (!rows[0]) return defaultValue;
    try {
      return JSON.parse(rows[0].value) as T;
    } catch {
      return defaultValue;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)]
    );
  }

  async remove(key: string): Promise<void> {
    await this.db.execute(`DELETE FROM settings WHERE key = ?`, [key]);
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.select<{ key: string; value: string }>(
      `SELECT * FROM settings`
    );
    const result: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        result[r.key] = JSON.parse(r.value);
      } catch {
        result[r.key] = r.value;
      }
    }
    return result;
  }
}

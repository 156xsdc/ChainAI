/**
 * 测试专用后端：better-sqlite3（真实 SQLite，纯 Node 运行）
 * ⚠️ 仅测试使用，不进入生产构建（生产用 backend.ts 的 TauriSqlBackend）
 */
import { createRequire } from "node:module";
import type { ExecuteResult, SqlBackend } from "./backend";

const require = createRequire(import.meta.url);

export class NodeSqliteBackend implements SqlBackend {
  private readonly db: import("better-sqlite3").Database;

  constructor(path = ":memory:") {
    const Database = require("better-sqlite3") as new (
      path: string
    ) => import("better-sqlite3").Database;
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params ?? [])) as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<ExecuteResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params ?? []));
    return {
      rowsAffected: result.changes,
      lastInsertId: Number(result.lastInsertRowid),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /** 测试辅助：事务内批量执行 */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

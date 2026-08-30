/**
 * SqlBackend：数据库访问抽象
 * - 生产环境：TauriSqlBackend（tauri-plugin-sql / SQLite）
 * - 测试环境：NodeSqliteBackend（better-sqlite3，真实SQLite）
 * 两者 SQL 方言一致，业务逻辑无需区分。
 */
import type TauriDatabase from "@tauri-apps/plugin-sql";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId: number;
}

export interface SqlBackend {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
  /** 关闭连接（可选） */
  close?(): Promise<void>;
}

/** 生产环境：Tauri SQL 插件 */
export class TauriSqlBackend implements SqlBackend {
  constructor(private readonly db: TauriDatabase) {}

  async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.select<T[]>(sql, params);
  }

  async execute(sql: string, params?: unknown[]): Promise<ExecuteResult> {
    const result = await this.db.execute(sql, params);
    return {
      rowsAffected: result.rowsAffected,
      lastInsertId: result.lastInsertId ?? 0,
    };
  }
}

/** 事务执行（基于 BEGIN/COMMIT/ROLLBACK，兼容两种后端） */
export async function withTransaction<T>(
  db: SqlBackend,
  fn: () => Promise<T>
): Promise<T> {
  await db.execute("BEGIN");
  try {
    const result = await fn();
    await db.execute("COMMIT");
    return result;
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}

/** 测试环境：better-sqlite3（真实 SQLite，纯 Node 运行） */
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

/**
 * 数据库初始化入口
 * - 生产环境：Tauri SQL 插件（sqlite:chainai.db，位于应用数据目录）
 * - 测试环境：直接传入 NodeSqliteBackend
 */
import Database from "@tauri-apps/plugin-sql";
import { SCHEMA_SQL } from "./schema";
import { TauriSqlBackend, type SqlBackend } from "./backend";
import { NodeRepository } from "./repositories/nodeRepo";
import { SessionRepository } from "./repositories/sessionRepo";
import { FavoriteRepository } from "./repositories/favoriteRepo";
import { GroupRepository } from "./repositories/groupRepo";
import { NoteRepository } from "./repositories/noteRepo";
import { SettingsRepository } from "./repositories/settingsRepo";
import { RecycleBinRepository } from "./repositories/recycleBinRepo";

export { TauriSqlBackend, withTransaction, type SqlBackend } from "./backend";
export * from "./types";
export * from "./repositories/nodeRepo";
export * from "./repositories/sessionRepo";
export * from "./repositories/favoriteRepo";
export * from "./repositories/groupRepo";
export * from "./repositories/noteRepo";
export * from "./repositories/settingsRepo";
export * from "./repositories/recycleBinRepo";

/** 应用数据仓库集合 */
export interface AppRepositories {
  backend: SqlBackend;
  nodes: NodeRepository;
  sessions: SessionRepository;
  favorites: FavoriteRepository;
  groups: GroupRepository;
  notes: NoteRepository;
  settings: SettingsRepository;
  recycleBin: RecycleBinRepository;
}

/** 对任意 backend 执行建表 */
export async function initSchema(db: SqlBackend): Promise<void> {
  for (const sql of SCHEMA_SQL) {
    await db.execute(sql);
  }
  // 兼容旧库：notes 表补充 category 列（已存在则忽略）
  try {
    await db.execute(
      `ALTER TABLE notes ADD COLUMN category TEXT NOT NULL DEFAULT ''`
    );
  } catch {
    // 列已存在
  }
}

/** 创建完整的仓库集合（传入已建表的 backend） */
export function createRepositories(db: SqlBackend): AppRepositories {
  return {
    backend: db,
    nodes: new NodeRepository(db),
    sessions: new SessionRepository(db),
    favorites: new FavoriteRepository(db),
    groups: new GroupRepository(db),
    notes: new NoteRepository(db),
    settings: new SettingsRepository(db),
    recycleBin: new RecycleBinRepository(db),
  };
}

/**
 * 生产环境初始化：加载 Tauri SQLite 并建表
 * 数据库文件默认位于应用数据目录（后续可配置迁移）
 */
export async function initAppDatabase(): Promise<AppRepositories> {
  const db = await Database.load("sqlite:chainai.db");
  const backend = new TauriSqlBackend(db);
  await initSchema(backend);
  return createRepositories(backend);
}

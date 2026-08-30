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
import { DirectoryRepository } from "./repositories/directoryRepo";
import { TreeRepository } from "./repositories/treeRepo";
import { AnswerVersionRepository } from "./repositories/answerVersionRepo";

export { TauriSqlBackend, withTransaction, type SqlBackend } from "./backend";
export * from "./types";
export * from "./repositories/nodeRepo";
export * from "./repositories/sessionRepo";
export * from "./repositories/favoriteRepo";
export * from "./repositories/groupRepo";
export * from "./repositories/noteRepo";
export * from "./repositories/settingsRepo";
export * from "./repositories/recycleBinRepo";
export * from "./repositories/directoryRepo";
export * from "./repositories/treeRepo";
export * from "./repositories/answerVersionRepo";

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
  directories: DirectoryRepository;
  trees: TreeRepository;
  answerVersions: AnswerVersionRepository;
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
  // 兼容旧库：nodes 表补充 tree_id 列（已存在则忽略）
  try {
    await db.execute(`ALTER TABLE nodes ADD COLUMN tree_id TEXT`);
  } catch {
    // 列已存在
  }
  // 兼容旧库：nodes 表补充 answer_version 列（已存在则忽略）
  try {
    await db.execute(
      `ALTER TABLE nodes ADD COLUMN answer_version INTEGER NOT NULL DEFAULT 1`
    );
  } catch {
    // 列已存在
  }
  // tree_id 列就绪后创建索引（旧库必须先有列）
  try {
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_nodes_tree ON nodes(tree_id)`
    );
  } catch {
    // 忽略
  }
  // 默认树：无树时创建；旧节点归入默认树
  const treeRows = await db.select<{ id: string }>(`SELECT id FROM trees LIMIT 1`);
  if (treeRows.length === 0) {
    await db.execute(
      `INSERT INTO trees (id, name, created_at) VALUES (?, ?, ?)`,
      [crypto.randomUUID(), "默认树", new Date().toISOString()]
    );
  }
  const firstTree = await db.select<{ id: string }>(
    `SELECT id FROM trees ORDER BY created_at ASC, rowid ASC LIMIT 1`
  );
  if (firstTree[0]) {
    await db.execute(
      `UPDATE nodes SET tree_id = ? WHERE tree_id IS NULL OR tree_id = ''`,
      [firstTree[0].id]
    );
  }
  // 迁移：把已有便签的分类目录同步到 directories 表（幂等）
  const noteCats = await db.select<{ category: string }>(
    `SELECT DISTINCT category FROM notes WHERE category != ''`
  );
  for (const r of noteCats) {
    const parts = r.category.split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      await db
        .execute(
          `INSERT OR IGNORE INTO directories (id, path) VALUES (?, ?)`,
          [crypto.randomUUID(), cur]
        )
        .catch(() => {});
    }
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
    directories: new DirectoryRepository(db),
    trees: new TreeRepository(db),
    answerVersions: new AnswerVersionRepository(db),
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

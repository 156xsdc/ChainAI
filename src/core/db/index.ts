/**
 * 数据库初始化入口
 * - 生产环境：Tauri SQL 插件（sqlite:chainai.db，位于应用数据目录）
 * - 测试环境：直接传入 NodeSqliteBackend
 */
import Database from "@tauri-apps/plugin-sql";
import { getAppDataDir, joinPath } from "../io/appPaths";
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
  // 兼容旧库：nodes 表补充 quote 列（引用功能，已存在则忽略）
  try {
    await db.execute(
      `ALTER TABLE nodes ADD COLUMN quote TEXT NOT NULL DEFAULT ''`
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
  // 收藏唯一性迁移：清理历史重复收藏（保留最早一条）+ 唯一索引
  // （旧库可能已存在重复；新库由建表 UNIQUE(node_id) 保证）
  try {
    await db.execute(
      `DELETE FROM favorites WHERE id NOT IN (SELECT MIN(id) FROM favorites GROUP BY node_id)`
    );
    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_node ON favorites(node_id)`
    );
  } catch {
    // 忽略（索引已存在等）
  }
  // 默认树：无树时创建；旧节点归入默认树
  const treeRows = await db.select<{ id: string }>(`SELECT id FROM trees LIMIT 1`);
  if (treeRows.length === 0) {
    await db.execute(
      `INSERT INTO trees (id, name, created_at) VALUES (?, ?, ?)`,
      [crypto.randomUUID(), "默认树", new Date().toISOString()]
    );
  }
  // 迁移：分支/新开始/合并节点缺失 tree_id 时，按父链补齐归属树
  // （历史版本 createBranch 未传 treeId，导致节点 tree_id 为 NULL、树状图不可见；
  //   逐层补齐，最多 50 轮防死循环）
  for (let i = 0; i < 50; i++) {
    const fixed = await db.execute(
      `UPDATE nodes SET tree_id = (
         SELECT p.tree_id FROM edges e
         JOIN nodes p ON p.id = e.parent_id
         WHERE e.child_id = nodes.id AND p.tree_id IS NOT NULL AND p.is_active = 1
         ORDER BY e.created_at ASC LIMIT 1
       )
       WHERE tree_id IS NULL AND is_active = 1`
    );
    if (fixed.rowsAffected === 0) break;
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
 * 数据库位于应用数据目录（安装版=exe所在目录；开发版=AppData），
 * 安装版首次启动时自动从旧位置（AppData）迁移已有数据
 */
export async function initAppDatabase(): Promise<AppRepositories> {
  const dataDir = await getAppDataDir();
  // 数据随程序走：安装版首次启动，把旧位置的数据库迁移到安装目录
  if (dataDir) {
    await migrateLegacyDb(dataDir).catch(() => {});
  }
  const dbPath = dataDir ? `sqlite:${joinPath(dataDir, "chainai.db")}` : "sqlite:chainai.db";
  const db = await Database.load(dbPath);
  const backend = new TauriSqlBackend(db);
  await initSchema(backend);
  return createRepositories(backend);
}

/**
 * 一次性迁移：把旧位置（AppData/com.16576.chainai）的数据库复制到新数据目录
 * - 目标已存在则跳过（幂等）
 * - 同时迁移 WAL 文件（未 checkpoint 的数据）
 * - 迁移失败静默（不阻断启动，新库从空开始）
 */
async function migrateLegacyDb(dataDir: string): Promise<void> {
  const { appConfigDir } = await import("@tauri-apps/api/path");
  const legacyDir = await appConfigDir();
  if (joinPath(legacyDir) === joinPath(dataDir)) return; // 开发版同目录，无需迁移
  const { invoke } = await import("@tauri-apps/api/core");
  const legacyDb = joinPath(legacyDir, "chainai.db");
  const targetDb = joinPath(dataDir, "chainai.db");
  await invoke("copy_file", { src: legacyDb, dst: targetDb });
  await invoke("copy_file", {
    src: joinPath(legacyDir, "chainai.db-wal"),
    dst: joinPath(dataDir, "chainai.db-wal"),
  }).catch(() => {});
}

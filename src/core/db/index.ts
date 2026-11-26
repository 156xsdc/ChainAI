/**
 * 数据库初始化入口
 * - 生产环境：Tauri SQL 插件（sqlite:chainai.db，位于应用数据目录）
 * - 测试环境：直接传入 NodeSqliteBackend
 */
import Database from "@tauri-apps/plugin-sql";
import { getAppDataDir, joinPath } from "../io/appPaths";
import { consolidateLegacyDbs } from "../io/legacyMigration";
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
  // 兼容旧库：nodes 表补充 reasoning 列（模型思考过程，已存在则忽略）
  try {
    await db.execute(
      `ALTER TABLE nodes ADD COLUMN reasoning TEXT NOT NULL DEFAULT ''`
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
  // 兼容旧库：trees 表补充 inherit_mode / inherit_count 列（树级上下文策略）
  try {
    await db.execute(
      `ALTER TABLE trees ADD COLUMN inherit_mode TEXT NOT NULL DEFAULT 'count'`
    );
  } catch {
    // 列已存在
  }
  try {
    await db.execute(
      `ALTER TABLE trees ADD COLUMN inherit_count INTEGER NOT NULL DEFAULT 5`
    );
  } catch {
    // 列已存在
  }
  // 兼容旧库：trees 表补充 folder 列（分类名，空 = 未分类）
  try {
    await db.execute(
      `ALTER TABLE trees ADD COLUMN folder TEXT NOT NULL DEFAULT ''`
    );
  } catch {
    // 列已存在
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
  if (dataDir) {
    // 历史脏库收敛：早期路径拼接 bug 在 macOS/Linux 上生成了「文件名带反斜杠」
    // 的多个独立库，先合并到规范路径 dir/chainai.db（幂等，原件留备份）
    await consolidateLegacyDbs(dataDir).catch(() => null);
    // 安装版首次启动，把旧位置的数据库迁移到安装目录（Windows 场景）
    await migrateLegacyDb(dataDir).catch(() => {});
  }
  const dbPath = dataDir ? `sqlite:${joinPath(dataDir, "chainai.db")}` : "sqlite:chainai.db";
  const db = await loadDatabase(dbPath, dataDir);
  const backend = new TauriSqlBackend(db);
  await initSchema(backend);
  return createRepositories(backend);
}

/**
 * 打开数据库；失败时清理"外来 WAL"残留后重试一次。
 *
 * 历史事故：安装版的迁移逻辑曾把**另一个数据库**（开发版数据目录）的 `-wal`
 * 拷进安装目录，SQLite 打开时判定 `database disk image is malformed`，
 * 表现为启动即「初始化失败」。
 * `-wal` / `-shm` 是派生文件，删掉后主库仍是最后一次检查点的完整快照，
 * 因此这里直接清理并重试一次（清理失败或重试仍失败则抛原始错误）。
 */
async function loadDatabase(
  dbPath: string,
  dataDir: string | null
): Promise<Database> {
  try {
    return await Database.load(dbPath);
  } catch (err) {
    if (!dataDir) throw err;
    const { invoke } = await import("@tauri-apps/api/core");
    let cleaned = false;
    for (const name of ["chainai.db-wal", "chainai.db-shm"]) {
      try {
        await invoke("delete_file", { path: joinPath(dataDir, name) });
        cleaned = true;
      } catch {
        // 文件本就不存在：忽略
      }
    }
    if (!cleaned) throw err;
    try {
      return await Database.load(dbPath);
    } catch (retryErr) {
      // 清理派生文件后仍打不开：主库本身已损坏，给出可操作的恢复指引
      throw new Error(
        `数据库无法打开：${(retryErr as Error).message}。` +
          `已自动清理残留的 -wal/-shm 仍未成功。可把安装目录下的 chainai.db 改名留作备份，` +
          `再从备份目录（backups/）选择最近的自动备份 JSON 在应用内导入恢复。`
      );
    }
  }
}

/**
 * 一次性迁移：把旧位置（AppData/com.16576.chainai）的数据库复制到新数据目录
 * - 只在目标库不存在时才会真正复制（Rust 侧 copy_file 目标已存在则跳过，幂等）
 * - **只拷主库，绝不单独拷 `-wal` / `-shm`**
 * - 迁移失败静默（不阻断启动，新库从空开始）
 *
 * ⚠️ 为什么不能拷 WAL：`-wal` 属于某个具体的数据库文件，它记录的是"那个库"的页。
 * 把 A 库的 WAL 放到 B 库旁边，SQLite 会在打开时把外来页当成自己的提交帧应用，
 * 直接判定 `database disk image is malformed`（2026-09 事故：开发版 WAL 被拷进
 * 安装目录 → 安装版一启动就「初始化失败」）。主库文件本身永远是最后一次检查点的
 * 一致快照，丢掉未 checkpoint 的少量新数据换取绝对不会开不了库。
 */
async function migrateLegacyDb(dataDir: string): Promise<void> {
  const { appConfigDir } = await import("@tauri-apps/api/path");
  const legacyDir = await appConfigDir();
  if (joinPath(legacyDir) === joinPath(dataDir)) return; // 开发版同目录，无需迁移
  const { invoke } = await import("@tauri-apps/api/core");
  const legacyDb = joinPath(legacyDir, "chainai.db");
  const targetDb = joinPath(dataDir, "chainai.db");
  await invoke("copy_file", { src: legacyDb, dst: targetDb });
}

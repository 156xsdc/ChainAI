/**
 * 历史数据库整理（调用 Rust 端 migrate_legacy_dbs）
 *
 * 背景：早期 `joinPath()` 在所有平台都用 `\` 拼接，macOS 上把
 * `/Applications/x` 拼成 `\Applications\x`（相对路径），被 sqlite 插件按
 * 应用数据目录解析后，每个启动位置都会生成一个「文件名带反斜杠」的独立库。
 * 结果：装在 /Applications 用的库、DMG 里直接运行用的库、dev 模式的库互不相通，
 * 用户看到的就是「升级/重装后聊天记录没了」。
 *
 * 这里在打开数据库前做一次性收敛：把散落库中数据最多的那个复制到规范路径
 * `dir/chainai.db`，原件备份到 `dir/legacy-db-backup/`，不删除任何历史文件。
 * Rust 侧保证幂等（目标已有数据则跳过）。
 */
import { invoke } from "@tauri-apps/api/core";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface LegacyDbCandidate {
  /** 历史文件名（含反斜杠的整段文件名） */
  name: string;
  /** 主库文件字节数 */
  bytes: number;
}

export interface LegacyDbMigration {
  /** 规范数据库路径 */
  target: string;
  /** 本次迁移来源文件名，未迁移为 null */
  migratedFrom?: string | null;
  /** 跳过原因（已迁移过 / 都是空库 / 无历史库） */
  skipped?: string | null;
  /** 发现的全部历史库 */
  candidates: LegacyDbCandidate[];
}

/** 收敛历史脏库到规范路径；浏览器/失败时返回 null（不阻断启动） */
export async function consolidateLegacyDbs(
  dir: string
): Promise<LegacyDbMigration | null> {
  if (!inTauri) return null;
  try {
    return await invoke<LegacyDbMigration>("migrate_legacy_dbs", { dir });
  } catch {
    return null;
  }
}

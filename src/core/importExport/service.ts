/**
 * JSON 导入导出服务（完整数据备份 / 覆盖恢复）
 * 表名来自硬编码常量（安全），行数据参数绑定插入（防注入）
 */
import type { AppRepositories } from "../db";

/** 导出表顺序（父表在前，保证外键插入顺序） */
export const EXPORT_TABLES = [
  "nodes",
  "edges",
  "sessions",
  "favorite_groups",
  "favorites",
  "node_groups",
  "node_group_members",
  "notes",
  "recycle_bin",
  "settings",
] as const;

export interface ExportData {
  app: "chainai";
  version: 1;
  exportedAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}

/** 导出全部数据为 JSON 字符串 */
export async function exportAll(repos: AppRepositories): Promise<string> {
  const data: ExportData = {
    app: "chainai",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {},
  };
  for (const table of EXPORT_TABLES) {
    data.tables[table] = await repos.backend.select<
      Record<string, unknown>
    >(`SELECT * FROM ${table}`);
  }
  return JSON.stringify(data, null, 2);
}

export interface ImportResult {
  nodes: number;
  edges: number;
  sessions: number;
}

/**
 * 预校验备份文件结构与列（不写库）
 * 列白名单来自当前库 PRAGMA table_info —— 与运行库永远一致；
 * 发现未知列（如更新版本导出的备份）直接拒绝，现有数据不受影响。
 */
export async function validateBackup(
  repos: AppRepositories,
  data: ExportData
): Promise<void> {
  for (const table of EXPORT_TABLES) {
    const rows = data.tables[table];
    if (!Array.isArray(rows)) continue;
    const cols = new Set(
      (
        await repos.backend.select<{ name: string }>(
          `PRAGMA table_info(${table})`
        )
      ).map((r) => r.name)
    );
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (typeof row !== "object" || row === null) {
        throw new Error(`备份文件 ${table} 表第 ${i + 1} 行格式非法，已取消导入`);
      }
      for (const key of Object.keys(row)) {
        if (!cols.has(key)) {
          throw new Error(
            `备份文件 ${table} 表包含未知列 "${key}"（可能来自更新版本），已取消导入，现有数据未受影响`
          );
        }
      }
    }
  }
}

/** 写导入前安全备份（仅 Tauri 环境；非 Tauri / 失败返回 null，不阻断导入） */
async function writeSafetyBackup(content: string): Promise<string | null> {
  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!inTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const { documentDir, join } = await import("@tauri-apps/api/path");
    const doc = await documentDir();
    const dir = await join(doc, "AITreeBackups");
    const file = await join(
      dir,
      `tongtu-pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    await invoke("write_text_file", { path: file, content });
    return file;
  } catch {
    return null;
  }
}

/**
 * 导入 JSON 备份（覆盖模式：清空现有数据后恢复）
 * 安全策略（不使用事务——tauri-plugin-sql 连接池不支持跨调用事务）：
 * 1. 预校验（列白名单）→ 非法备份直接拒绝，不动现有数据
 * 2. 导入前写安全备份 → 中途失败自动用备份恢复导入前数据
 * 3. 失败补偿 → 清空半导入数据，避免不一致状态残留
 */
export async function importAll(
  repos: AppRepositories,
  json: string
): Promise<ImportResult> {
  let data: ExportData;
  try {
    data = JSON.parse(json) as ExportData;
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (data.app !== "chainai" || !data.tables || typeof data.tables !== "object") {
    throw new Error("不是有效的 ChainAI 备份文件");
  }

  // 1. 预校验：不合法直接拒绝（现有数据不动）
  await validateBackup(repos, data);

  // 2. 安全备份：导入前导出当前数据（写文件失败不阻断）
  let safetyJson: string | null = null;
  let safetyPath: string | null = null;
  try {
    safetyJson = await exportAll(repos);
    safetyPath = await writeSafetyBackup(safetyJson);
  } catch {
    // 备份失败仍继续（预校验已挡掉主要风险）
  }

  // 3. 清空（子表在前）+ 恢复（父表在前）
  try {
    for (const table of [...EXPORT_TABLES].reverse()) {
      await repos.backend.execute(`DELETE FROM ${table}`);
    }
    let counts: ImportResult = { nodes: 0, edges: 0, sessions: 0 };
    for (const table of EXPORT_TABLES) {
      const rows = data.tables[table];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (typeof row !== "object" || row === null) continue;
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => "?").join(",");
        await repos.backend.execute(
          `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`,
          cols.map((c) => row[c])
        );
      }
      if (table === "nodes") counts.nodes = rows.length;
      if (table === "edges") counts.edges = rows.length;
      if (table === "sessions") counts.sessions = rows.length;
    }
    return counts;
  } catch (err) {
    // 4. 失败补偿：清掉半导入数据 → 尝试用安全备份自动恢复
    for (const table of [...EXPORT_TABLES].reverse()) {
      await repos.backend.execute(`DELETE FROM ${table}`).catch(() => {});
    }
    if (safetyJson) {
      try {
        await importAll(repos, safetyJson);
        throw new Error(
          `导入失败（${(err as Error).message}），已自动恢复导入前的数据`
        );
      } catch (e2) {
        if (e2 instanceof Error && e2.message.includes("已自动恢复")) throw e2;
        throw new Error(
          `导入失败（${(err as Error).message}）；自动恢复失败，导入前数据已备份至：${
            safetyPath ?? "（备份写入失败）"
          }`
        );
      }
    }
    throw err;
  }
}

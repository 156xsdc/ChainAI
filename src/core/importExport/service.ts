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

/** 导入 JSON 备份（覆盖模式：清空现有数据后恢复） */
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

  // 1. 清空（子表在前）
  for (const table of [...EXPORT_TABLES].reverse()) {
    await repos.backend.execute(`DELETE FROM ${table}`);
  }

  // 2. 恢复（父表在前）
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
}

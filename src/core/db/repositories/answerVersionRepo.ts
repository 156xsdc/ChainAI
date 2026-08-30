/**
 * 节点回答版本仓库：重新生成保留历史版本
 */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";

export interface AnswerVersion {
  version: number;
  content: string;
  createdAt: string;
}

export class AnswerVersionRepository {
  constructor(private readonly db: SqlBackend) {}

  /** 节点的全部版本（升序） */
  async list(nodeId: string): Promise<AnswerVersion[]> {
    const rows = await this.db.select<{
      version: number;
      content: string;
      created_at: string;
    }>(
      `SELECT version, content, created_at FROM node_answers
       WHERE node_id = ? ORDER BY version ASC`,
      [nodeId]
    );
    return rows.map((r) => ({
      version: r.version,
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  /** 追加新版本，返回版本号（当前最大 + 1） */
  async add(nodeId: string, content: string): Promise<number> {
    const max = await this.db.select<{ m: number | null }>(
      `SELECT MAX(version) AS m FROM node_answers WHERE node_id = ?`,
      [nodeId]
    );
    const version = (max[0]?.m ?? 0) + 1;
    await this.db.execute(
      `INSERT INTO node_answers (id, node_id, version, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [newId(), nodeId, version, content, now()]
    );
    return version;
  }
}

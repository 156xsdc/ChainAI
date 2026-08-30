/** 会话仓库：分支节点 = 新会话起点 */
import type { SqlBackend } from "../backend";
import { newId, now, rowToSession } from "../util";
import type { Session, SessionRow } from "../types";

export interface CreateSessionInput {
  name?: string;
  startNodeId: string;
  parentId?: string | null;
  inheritCount?: number;
}

export class SessionRepository {
  constructor(private readonly db: SqlBackend) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO sessions (id, name, start_node_id, parent_id, inherit_count, created_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        input.name ?? "",
        input.startNodeId,
        input.parentId ?? null,
        input.inheritCount ?? 10,
        ts,
      ]
    );
    const rows = await this.db.select<SessionRow>(
      `SELECT * FROM sessions WHERE id = ?`,
      [id]
    );
    return rowToSession(rows[0]);
  }

  async getById(id: string): Promise<Session | null> {
    const rows = await this.db.select<SessionRow>(
      `SELECT * FROM sessions WHERE id = ? AND is_active = 1`,
      [id]
    );
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async getByStartNode(nodeId: string): Promise<Session | null> {
    const rows = await this.db.select<SessionRow>(
      `SELECT * FROM sessions WHERE start_node_id = ? AND is_active = 1`,
      [nodeId]
    );
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async update(
    id: string,
    patch: Partial<Pick<Session, "name" | "inheritCount">>
  ): Promise<Session | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.inheritCount !== undefined) {
      sets.push("inherit_count = ?");
      params.push(patch.inheritCount);
    }
    if (sets.length === 0) return this.getById(id);
    params.push(id);
    await this.db.execute(
      `UPDATE sessions SET ${sets.join(", ")} WHERE id = ? AND is_active = 1`,
      params
    );
    return this.getById(id);
  }

  async getAll(): Promise<Session[]> {
    const rows = await this.db.select<SessionRow>(
      `SELECT * FROM sessions WHERE is_active = 1 ORDER BY created_at ASC, rowid ASC`
    );
    return rows.map(rowToSession);
  }
}

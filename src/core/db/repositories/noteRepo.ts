/** 便签仓库：元数据存 SQLite，内容存 Markdown 文件 */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";
import type { Note, NoteRow } from "../types";

export interface CreateNoteInput {
  title?: string;
  filePath: string;
  category?: string;
  color?: string;
  nodeId?: string | null;
  tags?: string[];
}

export class NoteRepository {
  constructor(private readonly db: SqlBackend) {}

  async create(input: CreateNoteInput): Promise<Note> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO notes (id, title, file_path, category, color, node_id, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.title ?? "",
        input.filePath,
        input.category ?? "",
        input.color ?? "#fafafa",
        input.nodeId ?? null,
        JSON.stringify(input.tags ?? []),
        ts,
        ts,
      ]
    );
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<Note | null> {
    const rows = await this.db.select<NoteRow>(
      `SELECT * FROM notes WHERE id = ?`,
      [id]
    );
    return rows[0] ? this.mapNote(rows[0]) : null;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<Note, "title" | "color" | "tags" | "nodeId" | "category" | "filePath">
    >
  ): Promise<Note | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.color !== undefined) {
      sets.push("color = ?");
      params.push(patch.color);
    }
    if (patch.tags !== undefined) {
      sets.push("tags = ?");
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.nodeId !== undefined) {
      sets.push("node_id = ?");
      params.push(patch.nodeId);
    }
    if (patch.category !== undefined) {
      sets.push("category = ?");
      params.push(patch.category);
    }
    if (patch.filePath !== undefined) {
      sets.push("file_path = ?");
      params.push(patch.filePath);
    }
    if (sets.length === 0) return this.getById(id);
    sets.push("updated_at = ?");
    params.push(now());
    params.push(id);
    await this.db.execute(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`, params);
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM notes WHERE id = ?`, [id]);
  }

  async listAll(): Promise<Note[]> {
    const rows = await this.db.select<NoteRow>(
      `SELECT * FROM notes ORDER BY updated_at DESC, rowid DESC`
    );
    return rows.map(this.mapNote);
  }

  /** 关联到某节点的便签 */
  async listByNode(nodeId: string): Promise<Note[]> {
    const rows = await this.db.select<NoteRow>(
      `SELECT * FROM notes WHERE node_id = ? ORDER BY updated_at DESC, rowid DESC`,
      [nodeId]
    );
    return rows.map(this.mapNote);
  }

  private mapNote(row: NoteRow): Note {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }
    return {
      id: row.id,
      title: row.title,
      filePath: row.file_path,
      category: row.category ?? "",
      color: row.color,
      nodeId: row.node_id,
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

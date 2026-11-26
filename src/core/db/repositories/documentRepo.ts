/** 文档仓库：树级资料库（导入的 PDF 提取结果） */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";
import type { Document } from "../types";

interface DocumentRow {
  id: string;
  tree_id: string;
  name: string;
  file_path: string;
  page_count: number;
  pages: string;
  created_at: string;
}

function parsePages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((p) => String(p ?? "")) : [];
  } catch {
    return [];
  }
}

function rowToDocument(r: DocumentRow): Document {
  return {
    id: r.id,
    treeId: r.tree_id,
    name: r.name,
    filePath: r.file_path,
    pageCount: r.page_count ?? 0,
    pages: parsePages(r.pages),
    createdAt: r.created_at,
  };
}

export interface CreateDocumentInput {
  treeId: string;
  name: string;
  filePath: string;
  /** 每页提取的文字 */
  pages: string[];
}

export class DocumentRepository {
  constructor(private readonly db: SqlBackend) {}

  async create(input: CreateDocumentInput): Promise<Document> {
    const id = newId();
    const ts = now();
    await this.db.execute(
      `INSERT INTO documents (id, tree_id, name, file_path, page_count, pages, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.treeId,
        input.name,
        input.filePath,
        input.pages.length,
        JSON.stringify(input.pages),
        ts,
      ]
    );
    return {
      id,
      treeId: input.treeId,
      name: input.name,
      filePath: input.filePath,
      pageCount: input.pages.length,
      pages: input.pages,
      createdAt: ts,
    };
  }

  async listByTree(treeId: string): Promise<Document[]> {
    const rows = await this.db.select<DocumentRow>(
      `SELECT * FROM documents WHERE tree_id = ? ORDER BY created_at DESC, rowid DESC`,
      [treeId]
    );
    return rows.map(rowToDocument);
  }

  async getById(id: string): Promise<Document | null> {
    const rows = await this.db.select<DocumentRow>(
      `SELECT * FROM documents WHERE id = ?`,
      [id]
    );
    return rows[0] ? rowToDocument(rows[0]) : null;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db.execute(`UPDATE documents SET name = ? WHERE id = ?`, [
      name,
      id,
    ]);
  }

  async remove(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM documents WHERE id = ?`, [id]);
  }
}

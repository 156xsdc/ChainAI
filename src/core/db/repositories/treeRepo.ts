/**
 * 树仓库：多棵树（每个树是独立的对话项目）
 * 每棵树可设置普通对话的上下文策略（固定最近N条 / 全部 / 每轮全新）
 */
import type { SqlBackend } from "../backend";
import { newId, now } from "../util";
import type { TreeInheritMode } from "../types";

export interface Tree {
  id: string;
  name: string;
  /** 普通对话上下文策略 */
  inheritMode: TreeInheritMode;
  inheritCount: number;
  /** 分类名（空 = 未分类） */
  folder: string;
  createdAt: string;
}

export interface CreateTreeInput {
  name?: string;
  inheritMode?: TreeInheritMode;
  /** inheritMode=count 时的条数 */
  inheritCount?: number;
}

export class TreeRepository {
  constructor(private readonly db: SqlBackend) {}

  /** 兼容旧调用：trees.create("树名") 或 trees.create({ name, inheritMode, inheritCount }) */
  async create(input: string | CreateTreeInput = {}): Promise<Tree> {
    const opts: CreateTreeInput =
      typeof input === "string" ? { name: input } : input;
    const id = newId();
    const ts = now();
    const mode = opts.inheritMode ?? "count";
    const count = opts.inheritCount ?? (mode === "count" ? 5 : 0);
    await this.db.execute(
      `INSERT INTO trees (id, name, inherit_mode, inherit_count, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, opts.name ?? "新树", mode, count, ts]
    );
    return {
      id,
      name: opts.name ?? "新树",
      inheritMode: mode,
      inheritCount: count,
      folder: "",
      createdAt: ts,
    };
  }

  async list(): Promise<Tree[]> {
    const rows = await this.db.select<TreeRowShape>(
      `SELECT * FROM trees ORDER BY created_at ASC, rowid ASC`
    );
    return rows.map(rowToTree);
  }

  async getById(id: string): Promise<Tree | null> {
    const rows = await this.db.select<TreeRowShape>(
      `SELECT * FROM trees WHERE id = ?`,
      [id]
    );
    return rows[0] ? rowToTree(rows[0]) : null;
  }

  /**
   * 批量设置分类（folder 为空 = 取消分类，回到「未分类」）
   * 分类只是树上的一个标签，不影响节点与删除逻辑。
   */
  async setFolder(treeIds: string[], folder: string): Promise<void> {
    if (treeIds.length === 0) return;
    const value = folder.trim();
    const ph = treeIds.map(() => "?").join(",");
    await this.db.execute(
      `UPDATE trees SET folder = ? WHERE id IN (${ph})`,
      [value, ...treeIds]
    );
  }

  /** 当前全部分类名（去重，排除未分类） */
  async listFolders(): Promise<string[]> {
    const rows = await this.db.select<{ folder: string }>(
      `SELECT DISTINCT folder FROM trees WHERE folder <> '' ORDER BY folder ASC`
    );
    return rows.map((r) => r.folder);
  }

  /** 更新树的上下文策略（建树后也能改，不必重建） */
  async updatePolicy(
    id: string,
    patch: { inheritMode?: TreeInheritMode; inheritCount?: number }
  ): Promise<Tree | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.inheritMode !== undefined) {
      sets.push("inherit_mode = ?");
      params.push(patch.inheritMode);
    }
    if (patch.inheritCount !== undefined) {
      sets.push("inherit_count = ?");
      params.push(patch.inheritCount);
    }
    if (sets.length === 0) return this.getById(id);
    params.push(id);
    await this.db.execute(
      `UPDATE trees SET ${sets.join(", ")} WHERE id = ?`,
      params
    );
    return this.getById(id);
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db.execute(`UPDATE trees SET name = ? WHERE id = ?`, [name, id]);
  }

  /** 删除树（节点由调用方处理：软删除 + 回收站） */
  async remove(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM trees WHERE id = ?`, [id]);
  }
}

interface TreeRowShape {
  id: string;
  name: string;
  inherit_mode: string;
  inherit_count: number;
  folder?: string | null;
  created_at: string;
}

function rowToTree(r: TreeRowShape): Tree {
  return {
    id: r.id,
    name: r.name,
    inheritMode: (r.inherit_mode as TreeInheritMode) || "count",
    inheritCount: r.inherit_count ?? 5,
    folder: r.folder ?? "",
    createdAt: r.created_at,
  };
}

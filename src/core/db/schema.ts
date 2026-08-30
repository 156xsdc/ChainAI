/**
 * SQLite 表结构定义（DDL）
 * 与产品需求文档"九、数据持久化"对应
 */

export const SCHEMA_SQL: string[] = [
  // 节点表：一个节点 = 用户问 + AI答
  `CREATE TABLE IF NOT EXISTS nodes (
    id           TEXT PRIMARY KEY,
    question     TEXT NOT NULL DEFAULT '',
    answer       TEXT NOT NULL DEFAULT '',
    type         TEXT NOT NULL DEFAULT 'normal',
    summary      TEXT NOT NULL DEFAULT '',
    color        TEXT NOT NULL DEFAULT '#333333',
    is_kept      INTEGER NOT NULL DEFAULT 0,
    is_favorited INTEGER NOT NULL DEFAULT 0,
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 边表：DAG 核心，支持多父节点（合并）
  `CREATE TABLE IF NOT EXISTS edges (
    id            TEXT PRIMARY KEY,
    parent_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    child_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'inherit',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(parent_id, child_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_edges_child ON edges(child_id)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_parent ON edges(parent_id)`,

  // 会话表：分支节点 = 新会话起点
  `CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT '',
    start_node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    parent_id     TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    inherit_count INTEGER NOT NULL DEFAULT 10,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    is_active     INTEGER NOT NULL DEFAULT 1
  )`,

  // 收藏分组
  `CREATE TABLE IF NOT EXISTS favorite_groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT '#333333',
    icon       TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 收藏项
  `CREATE TABLE IF NOT EXISTS favorites (
    id         TEXT PRIMARY KEY,
    node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    group_id   TEXT REFERENCES favorite_groups(id) ON DELETE SET NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 节点分组（虚线框，支持嵌套3级）
  `CREATE TABLE IF NOT EXISTS node_groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT '#333333',
    icon       TEXT NOT NULL DEFAULT '',
    summary    TEXT NOT NULL DEFAULT '',
    parent_id  TEXT REFERENCES node_groups(id) ON DELETE CASCADE,
    collapsed  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 节点-分组关联
  `CREATE TABLE IF NOT EXISTS node_group_members (
    group_id TEXT NOT NULL REFERENCES node_groups(id) ON DELETE CASCADE,
    node_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, node_id)
  )`,

  // 便签元数据（内容存 Markdown 文件）
  `CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    file_path  TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT '#fafafa',
    node_id    TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    tags       TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 回收站（软删除记录，默认保留30天）
  `CREATE TABLE IF NOT EXISTS recycle_bin (
    id         TEXT PRIMARY KEY,
    node_id    TEXT NOT NULL,
    session_id TEXT,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
  )`,

  // 设置表（JSON 值）
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '{}'
  )`,
];

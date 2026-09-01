/**
 * 数据表对应的 TypeScript 类型
 * 注意：数据库中的 INTEGER 布尔值在类型层转换为 boolean
 */

export type NodeType = "normal" | "new_start" | "merge";
export type RelationType = "inherit" | "non_inherit";

/** nodes 表行（原始） */
export interface NodeRow {
  id: string;
  tree_id: string | null;
  question: string;
  answer: string;
  type: NodeType;
  summary: string;
  color: string;
  is_kept: number;
  is_favorited: number;
  is_active: number;
  answer_version: number;
  /** 用户引用的 AI 回答片段（随问题持久化显示） */
  quote: string;
  created_at: string;
  updated_at: string;
}

/** 应用层节点 */
export interface TreeNode {
  id: string;
  treeId: string | null;
  question: string;
  answer: string;
  /** 当前显示的答案版本号 */
  answerVersion: number;
  type: NodeType;
  summary: string;
  color: string;
  isKept: boolean;
  isFavorited: boolean;
  isActive: boolean;
  /** 引用的 AI 回答片段（空串 = 无引用） */
  quote: string;
  createdAt: string;
  updatedAt: string;
}

/** edges 表行（原始） */
export interface EdgeRow {
  id: string;
  parent_id: string;
  child_id: string;
  relation_type: RelationType;
  created_at: string;
}

/** 应用层边 */
export interface TreeEdge {
  id: string;
  parentId: string;
  childId: string;
  relationType: RelationType;
  createdAt: string;
}

/** sessions 表行（原始） */
export interface SessionRow {
  id: string;
  name: string;
  start_node_id: string | null;
  parent_id: string | null;
  inherit_count: number;
  created_at: string;
  is_active: number;
}

/** 树级普通对话上下文策略 */
export type TreeInheritMode = "count" | "all" | "none";

/** 应用层会话 */
export interface Session {
  id: string;
  name: string;
  startNodeId: string | null;
  parentId: string | null;
  inheritCount: number;
  createdAt: string;
  isActive: boolean;
}

/** favorites 表 */
export interface FavoriteRow {
  id: string;
  node_id: string;
  group_id: string | null;
  note: string;
  created_at: string;
}

export interface Favorite {
  id: string;
  nodeId: string;
  groupId: string | null;
  note: string;
  createdAt: string;
}

/** favorite_groups 表 */
export interface FavoriteGroup {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
}

/** node_groups 表 */
export interface NodeGroup {
  id: string;
  name: string;
  color: string;
  icon: string;
  summary: string;
  parentId: string | null;
  collapsed: boolean;
  createdAt: string;
}

/** notes 表 */
export interface NoteRow {
  id: string;
  title: string;
  file_path: string;
  category: string;
  color: string;
  node_id: string | null;
  tags: string; // JSON 数组字符串
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  title: string;
  filePath: string;
  /** 分类子目录名（空 = 根目录） */
  category: string;
  color: string;
  nodeId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** recycle_bin 表 */
export interface RecycleBinRow {
  id: string;
  node_id: string;
  session_id: string | null;
  deleted_at: string;
  expires_at: string;
}

/** settings 表（value 为 JSON） */
export interface SettingsRow {
  key: string;
  value: string;
}

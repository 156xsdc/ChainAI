/**
 * 便签目录树构建：从便签分类（相对路径）构建树形结构
 * 目录由便签的 category 隐含存在（空目录不持久）
 */

export interface DirNode {
  /** 目录名（最后一级） */
  name: string;
  /** 完整相对路径（"" = 根） */
  path: string;
  children: DirNode[];
  /** 该目录下直接便签数（不含子目录） */
  noteCount: number;
}

/**
 * 构建目录树
 * @param categories 所有便签的分类（"" = 根目录）
 * @returns 根目录下的直接子目录（根节点由 UI 单独渲染）
 */
export function buildDirTree(categories: string[]): DirNode[] {
  const root: DirNode = { name: "", path: "", children: [], noteCount: 0 };

  for (const category of categories) {
    const parts = (category || "").split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      root.noteCount++;
      continue;
    }
    let node = root;
    let path = "";
    for (const p of parts) {
      path = path ? `${path}/${p}` : p;
      let child = node.children.find((c) => c.name === p);
      if (!child) {
        child = { name: p, path, children: [], noteCount: 0 };
        node.children.push(child);
      }
      node = child;
    }
    node.noteCount++;
  }

  return root.children;
}

/** 收集树中全部目录路径（含根 ""） */
export function collectDirPaths(tree: DirNode[]): string[] {
  const paths: string[] = [""];
  const walk = (nodes: DirNode[]) => {
    for (const n of nodes) {
      paths.push(n.path);
      walk(n.children);
    }
  };
  walk(tree);
  return paths;
}

/**
 * 从目录路径列表构建树结构（noteCount 恒为 0，由调用方按便签统计填充）
 * 用于持久化目录（directories 表）——空目录也能显示
 */
export function buildTreeFromPaths(paths: string[]): DirNode[] {
  const root: DirNode = { name: "", path: "", children: [], noteCount: 0 };
  for (const p of paths) {
    const parts = (p || "").split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
    let node = root;
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: cur, children: [], noteCount: 0 };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root.children;
}

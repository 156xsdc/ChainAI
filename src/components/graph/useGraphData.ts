/**
 * 树状图数据加载：全部活跃节点/边 + Git 布局 + 当前路径
 */
import { useEffect, useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { useGraphStore } from "../../store/graphStore";
import { computeGitLayout, type GitLayoutResult } from "../../core/graph/layout";
import type { NodeGroup, TreeEdge, TreeNode } from "../../core/db";

export interface GraphGroup {
  group: NodeGroup;
  memberIds: string[];
}

export interface GraphData {
  nodes: TreeNode[];
  edges: TreeEdge[];
  layout: GitLayoutResult;
  currentId: string | null;
  pathIds: Set<string>;
  groups: GraphGroup[];
}

export function useGraphData(): GraphData | null {
  const repos = useChatStore((s) => s.repos);
  const currentNodeId = useChatStore((s) => s.currentNodeId);
  // path 变化代表对话/导航发生，触发重新加载
  const path = useChatStore((s) => s.path);
  // 分组/结构变化触发重新加载
  const graphVersion = useGraphStore((s) => s.graphVersion);
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    if (!repos) return;
    let cancelled = false;
    (async () => {
      const [nodes, edges, pathSegs] = await Promise.all([
        repos.nodes.getAllActive(),
        repos.nodes.getAllActiveEdges(),
        currentNodeId
          ? repos.nodes.getPathToRoot(currentNodeId)
          : Promise.resolve([]),
      ]);
      if (cancelled) return;
      // 圆点节点布局更紧凑
      const layout = computeGitLayout(nodes, edges, {
        laneWidth: 90,
        rowHeight: 56,
      });
      // 加载节点分组（虚线框）
      const groupRows = await repos.groups.listGroups();
      const groups: GraphGroup[] = [];
      for (const g of groupRows) {
        groups.push({
          group: g,
          memberIds: await repos.groups.getMemberIds(g.id),
        });
      }
      if (cancelled) return;
      setData({
        nodes,
        edges,
        layout,
        currentId: currentNodeId,
        pathIds: new Set(pathSegs.map((p) => p.node.id)),
        groups,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos, currentNodeId, path, graphVersion]);

  return data;
}

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
  const currentTreeId = useChatStore((s) => s.currentTreeId);
  // 结构变化触发重新加载（对话/导航改变 currentNodeId；删除/分组等显式 bump）
  const graphVersion = useGraphStore((s) => s.graphVersion);
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    if (!repos) return;
    let cancelled = false;
    (async () => {
      // 路径高亮：使用多父展开的祖先集合（合并节点时所有父链都高亮）
      const ancestors = currentNodeId
        ? await repos.nodes.getAncestors(currentNodeId)
        : [];
      if (cancelled) return;
      const [nodes, edges] = await Promise.all([
        repos.nodes.getAllActive(currentTreeId),
        repos.nodes.getAllActiveEdges(currentTreeId),
      ]);
      if (cancelled) return;
      // 轻量圆点布局（轨道间距放宽，分支多时避免拥挤）
      const layout = computeGitLayout(nodes, edges, {
        laneWidth: 110,
        rowHeight: 56,
        nodeWidth: 26,
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
      const pathIds = new Set(ancestors.map((a) => a.id));
      if (currentNodeId) pathIds.add(currentNodeId);
      setData({
        nodes,
        edges,
        layout,
        currentId: currentNodeId,
        pathIds,
        groups,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos, currentNodeId, currentTreeId, graphVersion]);

  return data;
}

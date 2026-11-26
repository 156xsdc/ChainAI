/**
 * 树状图交互状态：用户手动调整的节点位置
 * 手动位置优先于算法布局；可整体重置回自动布局
 * 持久化到 settings('graph.manualPositions')
 */
import { create } from "zustand";
import { useChatStore } from "./chatStore";

interface GraphStore {
  /** 用户手动放置的节点位置（nodeId → 左上角坐标） */
  manualPositions: Record<string, { x: number; y: number }>;
  /** 分组/结构变化版本号（触发树状图数据刷新） */
  graphVersion: number;
  /** 请求把视口聚焦到当前整棵树（切换树时 +1） */
  treeFocusToken: number;
  requestTreeFocus: () => void;
  setManualPosition: (nodeId: string, pos: { x: number; y: number }) => void;
  /** 批量更新手动位置（仅内存，不写库——分组拖拽中高频调用） */
  setManualPositionsLocal: (
    positions: Record<string, { x: number; y: number }>
  ) => void;
  /** 持久化当前手动位置（分组拖拽结束调用一次） */
  persistManualPositions: () => void;
  loadPositions: (positions: Record<string, { x: number; y: number }>) => void;
  resetLayout: () => void;
  bumpGraphVersion: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  manualPositions: {},
  graphVersion: 0,
  treeFocusToken: 0,

  bumpGraphVersion: () => set((s) => ({ graphVersion: s.graphVersion + 1 })),

  requestTreeFocus: () =>
    set((s) => ({ treeFocusToken: s.treeFocusToken + 1 })),

  setManualPosition: (nodeId, pos) => {
    const next = { ...get().manualPositions, [nodeId]: pos };
    set({ manualPositions: next });
    // 持久化（fire-and-forget）
    const repos = useChatStore.getState().repos;
    if (repos) {
      repos.settings
        .set("graph.manualPositions", next)
        .catch(() => {});
    }
  },

  setManualPositionsLocal: (positions) => {
    set({ manualPositions: { ...get().manualPositions, ...positions } });
  },

  persistManualPositions: () => {
    const repos = useChatStore.getState().repos;
    if (repos) {
      repos.settings
        .set("graph.manualPositions", get().manualPositions)
        .catch(() => {});
    }
  },

  loadPositions: (positions) => set({ manualPositions: positions }),

  resetLayout: () => {
    set({ manualPositions: {} });
    const repos = useChatStore.getState().repos;
    if (repos) {
      repos.settings.set("graph.manualPositions", {}).catch(() => {});
    }
  },
}));

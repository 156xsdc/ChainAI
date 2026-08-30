/**
 * UI 状态：左侧面板（树状图/收藏）、右侧便签板、全屏等界面级状态
 */
import { create } from "zustand";

type Side = "right";
export type LeftPanel = "graph" | "favorites" | null;

interface UIState {
  /** 左侧当前面板（窄栏按钮切换，互斥） */
  leftPanel: LeftPanel;
  /** 右侧便签板是否展开 */
  rightExpanded: boolean;
  /** 树状图是否全屏 */
  graphFullscreen: boolean;
  /** 全局搜索（Ctrl+P） */
  searchOpen: boolean;

  setLeftPanel: (p: LeftPanel) => void;
  toggleLeftPanel: (p: Exclude<LeftPanel, null>) => void;
  setSidebar: (side: Side, expanded: boolean) => void;
  setGraphFullscreen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  leftPanel: null,
  rightExpanded: false,
  graphFullscreen: false,
  searchOpen: false,

  setLeftPanel: (p) => set({ leftPanel: p }),
  toggleLeftPanel: (p) =>
    set((s) => ({ leftPanel: s.leftPanel === p ? null : p })),
  setSidebar: (side, expanded) =>
    set(side === "right" ? { rightExpanded: expanded } : {}),
  setGraphFullscreen: (v) => set({ graphFullscreen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
}));

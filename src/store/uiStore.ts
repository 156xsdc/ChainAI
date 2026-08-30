/**
 * UI 状态：侧栏展开、树状图全屏等界面级状态
 */
import { create } from "zustand";

type Side = "left" | "right";

interface UIState {
  /** 左侧边栏是否展开 */
  leftExpanded: boolean;
  /** 右侧便签板是否展开 */
  rightExpanded: boolean;
  /** 树状图是否全屏 */
  graphFullscreen: boolean;
  /** 树状图面板（聊天区左侧）是否展开 */
  graphOpen: boolean;
  /** 全局搜索（Ctrl+P） */
  searchOpen: boolean;

  toggleSidebar: (side: Side) => void;
  setGraphOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setSidebar: (side: Side, expanded: boolean) => void;
  setGraphFullscreen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  leftExpanded: false,
  rightExpanded: false,
  graphFullscreen: false,
  graphOpen: false,
  searchOpen: false,

  setGraphOpen: (v) => set({ graphOpen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  toggleSidebar: (side) =>
    set((state) =>
      side === "left"
        ? { leftExpanded: !state.leftExpanded }
        : { rightExpanded: !state.rightExpanded }
    ),
  setSidebar: (side, expanded) =>
    set(
      side === "left"
        ? { leftExpanded: expanded }
        : { rightExpanded: expanded }
    ),
  setGraphFullscreen: (v) => set({ graphFullscreen: v }),
}));

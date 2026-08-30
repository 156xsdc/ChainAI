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

  toggleSidebar: (side: Side) => void;
  setSidebar: (side: Side, expanded: boolean) => void;
  setGraphFullscreen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  leftExpanded: false,
  rightExpanded: false,
  graphFullscreen: false,

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

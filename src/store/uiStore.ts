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
  /** 左侧面板共享宽度（树状图/收藏 共用，拖宽互通） */
  leftPanelWidth: number;
  /** 专注模式：树状图 + 便签并排（无聊天区） */
  focusMode: boolean;
  /** 进入专注前的便签板状态（退出时恢复） */
  focusPrevRightExpanded: boolean;

  setLeftPanel: (p: LeftPanel) => void;
  toggleLeftPanel: (p: Exclude<LeftPanel, null>) => void;
  setSidebar: (side: Side, expanded: boolean) => void;
  setGraphFullscreen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setLeftPanelWidth: (w: number) => void;
  setFocusMode: (v: boolean) => void;
  toggleFocusMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  leftPanel: null,
  rightExpanded: false,
  graphFullscreen: false,
  searchOpen: false,
  leftPanelWidth: 380,
  focusMode: false,
  focusPrevRightExpanded: false,

  setLeftPanel: (p) => set({ leftPanel: p }),
  setLeftPanelWidth: (w) => set({ leftPanelWidth: w }),
  setFocusMode: (v) => set({ focusMode: v }),
  toggleFocusMode: () =>
    set((s) => {
      if (s.focusMode) {
        // 退出：恢复进入前的便签板状态
        return { focusMode: false, rightExpanded: s.focusPrevRightExpanded };
      }
      // 进入：记录当前便签板状态，并强制展开便签板
      return {
        focusMode: true,
        focusPrevRightExpanded: s.rightExpanded,
        rightExpanded: true,
      };
    }),
  toggleLeftPanel: (p) =>
    set((s) => ({ leftPanel: s.leftPanel === p ? null : p })),
  setSidebar: (side, expanded) =>
    set(side === "right" ? { rightExpanded: expanded } : {}),
  setGraphFullscreen: (v) => set({ graphFullscreen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
}));

/**
 * 全局对话框服务：替代 window.confirm / window.prompt（系统原生样式）
 * 用法：
 *   const ok = await confirmDialog({ title: "确认", message: "..." });
 *   const name = await promptDialog({ title: "命名", defaultValue: "..." });
 */
import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
}

interface DialogStore {
  confirmState: (ConfirmOptions & { open: boolean }) | null;
  promptState: (PromptOptions & { open: boolean }) | null;
  confirmDialog: (opts: ConfirmOptions) => Promise<boolean>;
  promptDialog: (opts: PromptOptions) => Promise<string | null>;
  closeConfirm: () => void;
  closePrompt: () => void;
}

let confirmResolver: ((v: boolean) => void) | null = null;
let promptResolver: ((v: string | null) => void) | null = null;

export const useDialogStore = create<DialogStore>((set) => ({
  confirmState: null,
  promptState: null,

  confirmDialog: (opts) =>
    new Promise<boolean>((resolve) => {
      confirmResolver = resolve;
      set({ confirmState: { ...opts, open: true } });
    }),

  promptDialog: (opts) =>
    new Promise<string | null>((resolve) => {
      promptResolver = resolve;
      set({ promptState: { ...opts, open: true } });
    }),

  closeConfirm: () => {
    confirmResolver?.(false);
    confirmResolver = null;
    set({ confirmState: null });
  },

  closePrompt: () => {
    promptResolver?.(null);
    promptResolver = null;
    set({ promptState: null });
  },
}));

/** 便捷调用：确认对话框（await 返回 boolean） */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  useDialogStore.getState().confirmDialog(opts);

/** 便捷调用：输入对话框（await 返回 string | null） */
export const promptDialog = (opts: PromptOptions): Promise<string | null> =>
  useDialogStore.getState().promptDialog(opts);

/** 确认对话框按钮回调 */
export function resolveConfirm(v: boolean) {
  confirmResolver?.(v);
  confirmResolver = null;
  useDialogStore.setState({ confirmState: null });
}

/** 输入对话框按钮回调 */
export function resolvePrompt(v: string | null) {
  promptResolver?.(v);
  promptResolver = null;
  useDialogStore.setState({ promptState: null });
}

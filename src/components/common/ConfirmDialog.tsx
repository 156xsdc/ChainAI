/**
 * 确认对话框（全局服务，替代 window.confirm）
 */
import { useDialogStore, resolveConfirm } from "../../store/dialogStore";
import { Modal } from "./Modal";

export function ConfirmDialog() {
  const state = useDialogStore((s) => s.confirmState);

  return (
    <Modal
      open={state?.open ?? false}
      title={state?.title ?? ""}
      onClose={() => resolveConfirm(false)}
      width={380}
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] leading-relaxed text-neutral-600 whitespace-pre-wrap">
          {state?.message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-xl px-4 py-2 text-xs text-neutral-500 transition-colors hover:bg-neutral-100"
            onClick={() => resolveConfirm(false)}
          >
            取消
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-xs text-white transition-colors ${
              state?.danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-neutral-800 hover:bg-neutral-700"
            }`}
            onClick={() => resolveConfirm(true)}
            autoFocus
          >
            {state?.confirmText ?? "确定"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

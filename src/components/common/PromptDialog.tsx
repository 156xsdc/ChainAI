/**
 * 输入对话框（全局服务，替代 window.prompt）
 */
import { useEffect, useRef, useState } from "react";
import { useDialogStore, resolvePrompt } from "../../store/dialogStore";
import { Modal } from "./Modal";
import { useImeComposition } from "../../hooks/useImeComposition";

export function PromptDialog() {
  const state = useDialogStore((s) => s.promptState);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { compositionProps, shouldIgnoreEnter } = useImeComposition();

  useEffect(() => {
    if (state?.open) {
      setValue(state.defaultValue ?? "");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [state?.open, state?.defaultValue]);

  return (
    <Modal
      open={state?.open ?? false}
      title={state?.title ?? ""}
      onClose={() => resolvePrompt(null)}
      width={380}
    >
      <div className="flex flex-col gap-4">
        {state?.label && (
          <p className="text-xs text-neutral-500">{state.label}</p>
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={state?.placeholder}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[13px] text-neutral-800 outline-none transition-colors focus:border-neutral-400 focus:bg-white"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // 输入法确认候选词的回车不提交
              if (shouldIgnoreEnter(e)) return;
              resolvePrompt(value.trim());
            }
            if (e.key === "Escape") resolvePrompt(null);
          }}
          {...compositionProps}
        />
        <div className="flex justify-end gap-2">
          <button
            className="rounded-xl px-4 py-2 text-xs text-neutral-500 transition-colors hover:bg-neutral-100"
            onClick={() => resolvePrompt(null)}
          >
            取消
          </button>
          <button
            className="rounded-xl bg-neutral-800 px-4 py-2 text-xs text-white transition-colors hover:bg-neutral-700"
            onClick={() => resolvePrompt(value.trim())}
          >
            确定
          </button>
        </div>
      </div>
    </Modal>
  );
}

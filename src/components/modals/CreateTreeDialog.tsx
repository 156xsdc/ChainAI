/**
 * 新建树对话框：树名 + 普通对话上下文策略
 * - 固定最近 N 条（默认5）：上下文大小恒定可控
 * - 全部继承：发送完整路径上下文
 * - 每轮全新：不继承任何上下文
 */
import { useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";

interface CreateTreeDialogProps {
  open: boolean;
  onClose: () => void;
}

const modes = [
  {
    value: "count",
    label: "固定最近 N 条",
    desc: "上下文大小可控，防超限（推荐）",
  },
  { value: "all", label: "全部继承", desc: "发送完整对话路径（可能较长）" },
  { value: "none", label: "每轮全新", desc: "每次对话不继承任何上下文" },
] as const;

export function CreateTreeDialog({ open, onClose }: CreateTreeDialogProps) {
  const createTree = useChatStore((s) => s.createTree);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"count" | "all" | "none">("count");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    await createTree(name, {
      inheritMode: mode,
      inheritCount: mode === "count" ? count : undefined,
    });
    setBusy(false);
    setName("");
    setMode("count");
    setCount(5);
    onClose();
  };

  return (
    <Modal open={open} title="新建树" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">树名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：网站性能优化项目"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-neutral-500">
            普通对话上下文
          </label>
          <div className="flex flex-col gap-1.5">
            {modes.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                  mode === m.value
                    ? "border-neutral-500 bg-neutral-50"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <input
                  type="radio"
                  name="tree-inherit-mode"
                  className="mt-0.5 accent-neutral-800"
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                />
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-neutral-800">
                    {m.label}
                  </span>
                  <span className="block text-[11px] text-neutral-400">
                    {m.desc}
                  </span>
                </span>
                {m.value === "count" && mode === "count" && (
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-16 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-neutral-400"
                  />
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="rounded-xl bg-neutral-800 px-4 py-2 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </Modal>
  );
}

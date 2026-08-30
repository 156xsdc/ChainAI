/**
 * 分支创建对话框：设置会话名 + 上下文继承模式
 * 分支节点 = 新会话起点
 */
import { useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";
import type { CreateBranchParams } from "../../store/chatStore";

interface BranchDialogProps {
  open: boolean;
  parentNodeId: string;
  onClose: () => void;
}

const modes = [
  { value: "count", label: "继承最近 N 条", desc: "推荐：继承父链最近 N 条消息" },
  { value: "all", label: "全部继承", desc: "继承父链全部消息（可能较长）" },
  { value: "none", label: "不继承（新开始）", desc: "从零开始，与父节点虚线连接" },
] as const;

export function BranchDialog({ open, parentNodeId, onClose }: BranchDialogProps) {
  const createBranch = useChatStore((s) => s.createBranch);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<(typeof modes)[number]["value"]>("count");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    const params: CreateBranchParams = {
      name: name.trim() || undefined,
      inheritMode: mode,
      inheritCount: mode === "count" ? count : undefined,
    };
    await createBranch(parentNodeId, params);
    setBusy(false);
    setName("");
    setMode("count");
    setCount(10);
    onClose();
  };

  return (
    <Modal open={open} title="创建分支（新会话）" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">会话名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：缓存方向深入"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-neutral-500">
            上下文继承
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
                  name="inherit-mode"
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
            创建并跳转
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 从新开始对话框：创建不继承任何上下文的新开始节点
 */
import { useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";

interface NewStartDialogProps {
  open: boolean;
  onClose: () => void;
  /** 指定父节点（默认使用当前节点） */
  parentNodeId?: string;
}

export function NewStartDialog({ open, onClose, parentNodeId }: NewStartDialogProps) {
  const currentNodeId = useChatStore((s) => s.currentNodeId);
  const createNewStart = useChatStore((s) => s.createNewStart);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    const parentId = parentNodeId ?? currentNodeId;
    if (!parentId || busy) return;
    setBusy(true);
    await createNewStart(parentId);
    setBusy(false);
    setName("");
    onClose();
  };

  return (
    <Modal open={open} title="从新开始" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-amber-50/70 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
          新开始节点<b>不继承</b>当前任何上下文，AI 将以全新会话回应。
          <br />
          与当前节点之间将使用<b>虚线</b>连接，之后的新对话使用实线。
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">会话名称（可选）</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：换个话题聊聊"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          />
        </div>
        <div className="flex justify-end gap-2">
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
            确认开始
          </button>
        </div>
      </div>
    </Modal>
  );
}

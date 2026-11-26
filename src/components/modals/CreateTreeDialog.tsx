/**
 * 新建树对话框：只建树，不配上下文
 *
 * 上下文继承统一走「设置 → 上下文继承」这一个入口（编辑当前树的策略），
 * 避免两处都能改、口径不一致。新树默认用「最近 N 条」（N = 全局默认继承条数）。
 */
import { useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";

interface CreateTreeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTreeDialog({ open, onClose }: CreateTreeDialogProps) {
  const createTree = useChatStore((s) => s.createTree);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    await createTree(name);
    setBusy(false);
    setName("");
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

        <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-[11px] leading-relaxed text-neutral-400">
          上下文继承在「设置 → 上下文继承」里统一配置：新树默认「最近 N
          条」，建好后可随时改。
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

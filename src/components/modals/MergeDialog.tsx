/**
 * 综合合并对话框：合并两个节点为新节点（新会话）
 * 从两条父链分别继承上下文（按继承数量压缩）
 */
import { useEffect, useState } from "react";
import { GitMerge } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";

interface MergeDialogProps {
  open: boolean;
  sourceId: string;
  targetId: string;
  onClose: () => void;
}

export function MergeDialog({ open, sourceId, targetId, onClose }: MergeDialogProps) {
  const repos = useChatStore((s) => s.repos);
  const createMerge = useChatStore((s) => s.createMerge);
  const [sourceQ, setSourceQ] = useState("");
  const [targetQ, setTargetQ] = useState("");
  const [name, setName] = useState("");
  const [inheritCount, setInheritCount] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !repos) return;
    repos.nodes.getNode(sourceId).then((n) => setSourceQ(n?.question || "（空节点）"));
    repos.nodes.getNode(targetId).then((n) => setTargetQ(n?.question || "（空节点）"));
  }, [open, sourceId, targetId, repos]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    await createMerge([sourceId, targetId], {
      name: name.trim() || undefined,
      inheritCount,
    });
    setBusy(false);
    onClose();
  };

  const truncate = (s: string, n = 18) =>
    s.length > n ? s.slice(0, n) + "…" : s;

  return (
    <Modal open={open} title="综合合并（新会话）" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* 合并结构示意 */}
        <div className="flex items-center justify-center gap-3 rounded-xl bg-neutral-50 px-3 py-3.5">
          <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-center">
            <div className="text-[10px] text-neutral-400">父链 A</div>
            <div className="truncate text-xs text-neutral-700" title={sourceQ}>
              {truncate(sourceQ)}
            </div>
          </div>
          <GitMerge size={18} className="shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-center">
            <div className="text-[10px] text-neutral-400">父链 B</div>
            <div className="truncate text-xs text-neutral-700" title={targetQ}>
              {truncate(targetQ)}
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-500">
          合并将创建新节点（<b>新会话</b>），同时从两条父链继承上下文。
          之后在该节点的对话基于两条分支的综合理解。
        </p>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-neutral-500">会话名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：综合两分支结论"
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs text-neutral-500">
              每条链继承
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={inheritCount}
              onChange={(e) => setInheritCount(Number(e.target.value))}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </div>
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
            合并并跳转
          </button>
        </div>
      </div>
    </Modal>
  );
}

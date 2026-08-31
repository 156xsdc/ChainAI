/**
 * 综合合并对话框：合并多个节点为新节点（新会话）
 * 从各条父链分别继承上下文（按继承数量压缩）
 */
import { useEffect, useState } from "react";
import { GitMerge } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { Modal } from "../common/Modal";

interface MergeDialogProps {
  open: boolean;
  parentNodeIds: string[];
  onClose: () => void;
}

const MAX_SHOW = 3; // 对话框最多展示的父节点卡片数

export function MergeDialog({
  open,
  parentNodeIds,
  onClose,
}: MergeDialogProps) {
  const repos = useChatStore((s) => s.repos);
  const createMerge = useChatStore((s) => s.createMerge);
  const [parents, setParents] = useState<Array<{ id: string; question: string }>>(
    []
  );
  const [name, setName] = useState("");
  const [inheritCount, setInheritCount] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !repos || parentNodeIds.length < 2) return;
    void (async () => {
      const list = await Promise.all(
        parentNodeIds.map(async (id) => {
          const n = await repos.nodes.getNode(id);
          return { id, question: n?.question || "（空节点）" };
        })
      );
      setParents(list);
    })();
  }, [open, parentNodeIds, repos]);

  const handleConfirm = async () => {
    if (busy || parentNodeIds.length < 2) return;
    setBusy(true);
    try {
      await createMerge(parentNodeIds, {
        name: name.trim() || undefined,
        inheritCount,
      });
      onClose();
    } catch (err) {
      // 合并失败：提示并恢复可操作状态（避免 busy 卡死）
      useChatStore.getState().setUiError(
        `合并失败：${(err as Error).message}`
      );
    } finally {
      setBusy(false);
    }
  };

  const truncate = (s: string, n = 18) =>
    s.length > n ? s.slice(0, n) + "…" : s;

  return (
    <Modal open={open} title="综合合并（新会话）" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* 合并结构示意：父链 → 合并节点 */}
        <div className="rounded-xl bg-neutral-50 px-3 py-3.5">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {parents.slice(0, MAX_SHOW).map((p, i) => (
              <div
                key={p.id}
                className="min-w-0 max-w-[160px] flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-center"
              >
                <div className="text-[10px] text-neutral-400">父链 {i + 1}</div>
                <div className="truncate text-xs text-neutral-700" title={p.question}>
                  {truncate(p.question)}
                </div>
              </div>
            ))}
            {parents.length > MAX_SHOW && (
              <span className="shrink-0 text-[11px] text-neutral-400">
                +{parents.length - MAX_SHOW} 条
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-neutral-400">
            <GitMerge size={14} className="shrink-0" />
            <span>↓ 合并为新节点（新会话）</span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-500">
          合并将创建新节点（<b>新会话</b>），同时从
          <b>{parents.length || parentNodeIds.length}</b> 条父链继承上下文。
          之后在该节点的对话基于各分支的综合理解。
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

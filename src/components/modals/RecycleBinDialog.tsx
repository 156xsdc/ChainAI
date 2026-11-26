/**
 * 回收站对话框：查看被删除分支、恢复、彻底删除
 */
import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useGraphStore } from "../../store/graphStore";
import { confirmDialog } from "../../store/dialogStore";
import { Modal } from "../common/Modal";

interface BinItem {
  nodeId: string;
  question: string;
  deletedAt: string;
  expiresAt: string;
}

export function RecycleBinDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const repos = useChatStore((s) => s.repos);
  const setNotice = useChatStore((s) => s.setNotice);
  const [items, setItems] = useState<BinItem[]>([]);

  const load = useCallback(async () => {
    if (!repos) return;
    // 单次 JOIN 查询（避免 N+1）
    const records = await repos.recycleBin.listWithQuestions();
    setItems(
      records.map((r) => ({
        nodeId: r.node_id,
        question: r.question || "（空节点）",
        deletedAt: r.deleted_at,
        expiresAt: r.expires_at,
      }))
    );
  }, [repos]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleRestore = async (nodeId: string) => {
    if (!repos) return;
    const result = await repos.recycleBin.restore(nodeId);

    // 原树已被删除 → restore 会用该节点的问题新建一棵树；刷新树列表并跳过去
    if (result.newTrees.length > 0) {
      const trees = await repos.trees.list();
      useChatStore.setState({ trees });
      const created = result.newTrees[0];
      await useChatStore.getState().switchTree(created.id);
      await useChatStore.getState().navigateTo(nodeId);
      setNotice(`♻️ 已恢复，并新建树「${created.name}」`);
    } else {
      setNotice(`♻️ 已恢复 ${result.restoredNodes} 个节点`);
      useGraphStore.getState().bumpGraphVersion();
    }
    void load();
  };

  const handlePurge = async (nodeId: string) => {
    if (!repos) return;
    const ok = await confirmDialog({
      title: "彻底删除",
      message: "彻底删除后不可恢复，确定？",
      confirmText: "彻底删除",
      danger: true,
    });
    if (!ok) return;
    await repos.nodes.hardDeleteNode(nodeId);
    await repos.recycleBin.remove(nodeId);
    void load();
  };

  const handleEmptyAll = async () => {
    if (!repos || items.length === 0) return;
    const ok = await confirmDialog({
      title: "清空回收站",
      message: `彻底删除回收站中全部 ${items.length} 个节点？\n不可恢复！`,
      confirmText: "清空",
      danger: true,
    });
    if (!ok) return;
    for (const it of items) {
      await repos.nodes.hardDeleteNode(it.nodeId);
      await repos.recycleBin.remove(it.nodeId);
    }
    setNotice("🗑️ 回收站已清空");
    void load();
  };

  return (
    <Modal open={open} title="回收站" onClose={onClose} width={520}>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-300">
            回收站为空
          </div>
        ) : (
          items.map((it) => (
            <div
              key={it.nodeId}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-neutral-700">
                  {it.question}
                </div>
                <div className="mt-0.5 text-[10px] text-neutral-400">
                  删除于 {new Date(it.deletedAt).toLocaleString()} · 过期于{" "}
                  {new Date(it.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <button
                className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100"
                onClick={() => void handleRestore(it.nodeId)}
              >
                <RotateCcw size={11} /> 恢复
              </button>
              <button
                className="rounded-lg p-1.5 text-neutral-300 hover:bg-red-50 hover:text-red-500"
                title="彻底删除"
                onClick={() => void handlePurge(it.nodeId)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}

        {items.length > 0 && (
          <button
            className="mt-1 self-end rounded-lg px-3 py-1.5 text-[11px] text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
            onClick={() => void handleEmptyAll()}
          >
            清空回收站
          </button>
        )}
      </div>
    </Modal>
  );
}

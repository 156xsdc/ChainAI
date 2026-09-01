/**
 * 树状图节点右键菜单：收藏 / 保留 / 跳转 / 删除分支
 * （分支与从新开始在消息输入卡片中提供）
 */
import { useEffect, useState } from "react";
import { Bookmark, CornerUpRight, Pin, Trash2 } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useClickOutside } from "../../hooks/useClickOutside";
import { confirmDialog } from "../../store/dialogStore";
import type { TreeNode } from "../../core/db";

interface GraphNodeMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

export function GraphNodeMenu({ x, y, nodeId, onClose }: GraphNodeMenuProps) {
  const repos = useChatStore((s) => s.repos);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const toggleKeep = useChatStore((s) => s.toggleKeep);
  const deleteBranch = useChatStore((s) => s.deleteBranch);
  const setNotice = useChatStore((s) => s.setNotice);
  const setUiError = useChatStore((s) => s.setUiError);
  const [node, setNode] = useState<TreeNode | null>(null);

  useEffect(() => {
    if (!repos) return;
    void repos.nodes.getNode(nodeId).then(setNode);
  }, [repos, nodeId]);

  /** 删除该节点所在分支（整棵子树 → 回收站，带保护检查） */
  const handleDeleteBranch = async () => {
    if (!repos) return;
    onClose();
    const descendants = await repos.nodes.getDescendantIds(nodeId);
    // 受保护检查：收藏 / 保留 / 便签关联的节点不可删除
    let protectedCount = 0;
    for (const id of descendants) {
      const n = await repos.nodes.getNode(id);
      if (n && (n.isKept || n.isFavorited)) protectedCount++;
      const notes = await repos.notes.listByNode(id);
      if (notes.length > 0) protectedCount++;
    }
    if (protectedCount > 0) {
      await confirmDialog({
        title: "无法删除",
        message: `该分支包含 ${protectedCount} 个受保护节点（⭐收藏 / 📌保留 / 📝便签关联）。\n请先取消这些节点的保护标记后再删除。`,
        confirmText: "知道了",
      });
      return;
    }
    const ok = await confirmDialog({
      title: "删除分支",
      message: `确定删除该分支及其下全部对话（${descendants.length} 个节点）？\n删除后移入回收站，30 天内可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const { deletedCount } = await deleteBranch(nodeId);
    setNotice(`🗑️ 已删除分支（${deletedCount} 个节点移入回收站）`);
  };

  const menuRef = useClickOutside<HTMLDivElement>(onClose);

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 240),
    left: Math.min(x, window.innerWidth - 190),
    zIndex: 100,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
          onClick={() => {
            void (async () => {
              const wasFav = node?.isFavorited;
              await toggleFavorite(nodeId);
              setNotice(wasFav ? "已取消收藏" : "⭐ 已收藏");
              onClose();
            })();
          }}
        >
          <Bookmark size={13} className="text-neutral-400" />
          {node?.isFavorited ? "取消收藏" : "收藏"}
        </button>
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
          onClick={() => {
            void (async () => {
              const wasKept = node?.isKept;
              await toggleKeep(nodeId);
              setNotice(wasKept ? "已取消保留" : "📌 已保留（防清理）");
              onClose();
            })();
          }}
        >
          <Pin size={13} className="text-neutral-400" />
          {node?.isKept ? "取消保留标记" : "保留标记（防清理）"}
        </button>
        <div className="my-1 h-px bg-neutral-100" />
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
          onClick={() => {
            void navigateTo(nodeId);
            onClose();
          }}
        >
          <CornerUpRight size={13} className="text-neutral-400" />
          跳转到该节点
        </button>
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
          onClick={() => void handleDeleteBranch()}
        >
          <Trash2 size={13} />
          删除分支（含子树）
        </button>
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-400 hover:bg-neutral-100"
          onClick={() => {
            setUiError("合并：拖拽该节点到另一个节点，或框选多个节点后点击「合并」");
            onClose();
          }}
        >
          🔀 合并（拖拽 / 框选触发）
        </button>
    </div>
  );
}

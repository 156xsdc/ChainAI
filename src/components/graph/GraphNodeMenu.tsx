/**
 * 树状图节点右键菜单：收藏 / 保留 / 跳转（分支与从新开始在消息输入卡片中提供）
 */
import { useEffect, useState } from "react";
import { Bookmark, CornerUpRight, Pin } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useClickOutside } from "../../hooks/useClickOutside";
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
  const setUiError = useChatStore((s) => s.setUiError);
  const [node, setNode] = useState<TreeNode | null>(null);

  useEffect(() => {
    if (!repos) return;
    void repos.nodes.getNode(nodeId).then(setNode);
  }, [repos, nodeId]);

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
            void toggleFavorite(nodeId);
            onClose();
          }}
        >
          <Bookmark size={13} className="text-neutral-400" />
          {node?.isFavorited ? "取消收藏" : "收藏"}
        </button>
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
          onClick={() => {
            void toggleKeep(nodeId);
            onClose();
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
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-400 hover:bg-neutral-100"
          onClick={() => {
            setUiError("合并：拖拽该节点到另一个节点上即可触发综合合并");
            onClose();
          }}
        >
          🔀 合并（拖拽触发）
        </button>
    </div>
  );
}

/**
 * 右键菜单：复制、收藏、创建便签（占位）
 */
import { useEffect } from "react";
import { Copy, Star, StickyNote } from "lucide-react";
import { useChatStore } from "../../store/chatStore";

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

export function ContextMenu({ x, y, nodeId, onClose }: ContextMenuProps) {
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const repos = useChatStore((s) => s.repos);

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("click", handler);
    window.addEventListener("blur", handler);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("blur", handler);
    };
  }, [onClose]);

  const handleCopy = async () => {
    const node = await repos?.nodes.getNode(nodeId);
    if (node) {
      const text = node.question
        ? `**用户：**${node.question}\n\n${node.answer ? `**AI：**${node.answer}` : ""}`
        : node.answer;
      await navigator.clipboard.writeText(text);
    }
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 200),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 100,
  };

  return (
    <div
      style={menuStyle}
      className="w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem icon={<Copy size={13} />} label="复制内容" onClick={handleCopy} />
      <MenuItem
        icon={<Star size={13} />}
        label="收藏 / 取消收藏"
        onClick={async () => {
          await toggleFavorite(nodeId);
          onClose();
        }}
      />
      <MenuItem
        icon={<StickyNote size={13} />}
        label="创建便签"
        disabled
        onClick={onClose}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
    >
      <span className="text-neutral-400">{icon}</span>
      {label}
    </button>
  );
}

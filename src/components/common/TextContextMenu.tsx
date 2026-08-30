/**
 * 文本编辑右键菜单：输入框/选中文本的剪切/复制/粘贴/全选
 * 极简黑白灰风格；消息区/树状图已有专属菜单（跳过）
 */
import { useEffect, useState } from "react";
import { Copy, Scissors, ClipboardPaste, ListChecks } from "lucide-react";
import { useClickOutside } from "../../hooks/useClickOutside";

interface MenuState {
  x: number;
  y: number;
  /** 可编辑元素（input/textarea/contenteditable），null = 仅选中文本 */
  editable: HTMLElement | null;
}

export function TextContextMenu() {
  const [state, setState] = useState<MenuState | null>(null);
  const menuRef = useClickOutside<HTMLDivElement>(() => setState(null), state !== null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 已有专属菜单的区域（聊天消息 / 树状图节点）跳过
      if (target.closest("[data-message], .react-flow__node")) return;

      const editable = target.closest<HTMLElement>(
        'input, textarea, [contenteditable="true"]'
      );
      const selection = window.getSelection()?.toString().trim();
      if (editable || selection) {
        e.preventDefault();
        setState({ x: e.clientX, y: e.clientY, editable });
      } else {
        setState(null);
      }
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  if (!state) return null;

  const exec = (cmd: string) => {
    document.execCommand(cmd);
    setState(null);
  };

  const copySelection = () => {
    if (state.editable) {
      exec("copy");
    } else {
      void navigator.clipboard.writeText(window.getSelection()?.toString() ?? "");
      setState(null);
    }
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(state.y, window.innerHeight - 160),
    left: Math.min(state.x, window.innerWidth - 170),
    zIndex: 200,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-36 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.editable && (
        <>
          <MenuItem
            icon={<Scissors size={12} />}
            label="剪切"
            onClick={() => exec("cut")}
          />
          <MenuItem
            icon={<ClipboardPaste size={12} />}
            label="粘贴"
            onClick={() => exec("paste")}
          />
        </>
      )}
      <MenuItem icon={<Copy size={12} />} label="复制" onClick={copySelection} />
      {state.editable && (
        <MenuItem
          icon={<ListChecks size={12} />}
          label="全选"
          onClick={() => exec("selectAll")}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
      onClick={onClick}
    >
      <span className="text-neutral-400">{icon}</span>
      {label}
    </button>
  );
}

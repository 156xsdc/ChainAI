/**
 * 通用弹窗：极简黑白灰 · 毛玻璃遮罩 · 入场动画
 */
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /**
   * 点击遮罩是否关闭（默认 true）。
   * 表单类弹窗（如编辑 AI 配置）可传 false，避免误点遮罩丢掉已填内容。
   */
  closeOnBackdrop?: boolean;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  width = 440,
  closeOnBackdrop = true,
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="animate-modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]"
      // 用 mousedown（且按下时就在遮罩上）判断关闭：
      // 面板内选中文字拖到面板外松手不再被误判为"点击遮罩"而关闭弹窗
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-modal-pop flex max-h-[82vh] w-full flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h3 className="text-[13px] font-medium tracking-wide text-neutral-800">
            {title}
          </h3>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            onClick={onClose}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * 颜色选择对话框：预设淡色板（轻量风格）+ 自定义 HEX/rgba 输入
 */
import { useEffect, useState } from "react";
import { Modal } from "./Modal";

/** 预设色板：淡色、亮色系（符合"轻"的主旨） */
export const LIGHT_PRESET_COLORS = [
  "#E8F1F8", // 淡蓝
  "#E6F4EA", // 淡绿
  "#FDF6E3", // 淡黄
  "#FCE8EC", // 淡粉
  "#EFEAF8", // 淡紫
  "#E0F2F1", // 淡青
  "#FDF0E4", // 淡橙
  "#F1F1F1", // 淡灰
  "#D6E9F8", // 亮蓝
  "#D2EDD9", // 亮绿
  "#F9E7C8", // 亮琥珀
  "#F5DCE5", // 亮粉
];

interface ColorDialogProps {
  open: boolean;
  title?: string;
  value: string;
  onClose: () => void;
  onConfirm: (color: string) => void;
}

export function ColorDialog({
  open,
  title = "选择颜色",
  value,
  onClose,
  onConfirm,
}: ColorDialogProps) {
  const [custom, setCustom] = useState(value || "");

  // 对话框重开/切换目标时同步自定义输入（useState 只在首次挂载初始化）
  useEffect(() => {
    setCustom(value || "");
  }, [value]);

  const apply = (color: string) => {
    onConfirm(color);
    onClose();
  };

  return (
    <Modal open={open} title={title} onClose={onClose} width={340}>
      <div className="flex flex-col gap-4">
        {/* 预设淡色板 */}
        <div>
          <div className="mb-1.5 text-[10px] text-neutral-400">预设（淡色系）</div>
          <div className="grid grid-cols-6 gap-1.5">
            {LIGHT_PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`h-8 w-full rounded-lg border transition-transform hover:scale-105 ${
                  value === c
                    ? "border-neutral-700 ring-1 ring-neutral-700 ring-offset-1"
                    : "border-neutral-200"
                }`}
                style={{ background: c }}
                title={c}
                onClick={() => apply(c)}
              />
            ))}
          </div>
        </div>

        {/* 自定义颜色 */}
        <div>
          <div className="mb-1.5 text-[10px] text-neutral-400">
            自定义（HEX 或 rgba）
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 shrink-0 rounded-lg border border-neutral-200"
              style={{
                background: /^[#(]/.test(custom.trim()) ? custom.trim() : "#ffffff",
              }}
            />
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="#A8C8E8 或 rgba(168,200,232,0.5)"
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) apply(custom.trim());
              }}
            />
            <button
              className="shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
              disabled={!custom.trim()}
              onClick={() => apply(custom.trim())}
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

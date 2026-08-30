/**
 * 自定义标题栏（替换系统标题栏，decorations: false）
 * 极简黑白灰：应用名 + 最小化/最大化/关闭
 * 关闭 = 隐藏到托盘（Rust 端 CloseRequested 拦截）
 */
import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        setMaximized(await appWindow.isMaximized());
        unlisten = await appWindow.onResized(() => {
          void appWindow.isMaximized().then((m) => setMaximized(m));
        });
      } catch {
        // 非 Tauri 环境忽略
      }
      if (cancelled && unlisten) unlisten();
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [appWindow]);

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-neutral-200 bg-white pl-3"
    >
      {/* 左侧：应用标识 */}
      <div data-tauri-drag-region className="flex items-center gap-1.5 text-[11px]">
        <span className="font-semibold tracking-wide text-neutral-700">
          ChainAI
        </span>
        <span className="text-neutral-300">·</span>
        <span className="text-neutral-400">树状对话</span>
      </div>

      {/* 右侧：窗口控制 */}
      <div className="flex h-full items-center">
        <TitleButton
          title="最小化"
          onClick={() => void appWindow.minimize()}
        >
          <Minus size={14} strokeWidth={1.6} />
        </TitleButton>
        <TitleButton
          title={maximized ? "还原" : "最大化"}
          onClick={() => void appWindow.toggleMaximize()}
        >
          <Square
            size={10.5}
            strokeWidth={1.6}
            className={maximized ? "translate-y-px" : ""}
          />
        </TitleButton>
        <TitleButton title="关闭" danger onClick={() => void appWindow.close()}>
          <X size={14} strokeWidth={1.6} />
        </TitleButton>
      </div>
    </div>
  );
}

function TitleButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      data-tauri-drag-region="false"
      title={title}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-neutral-500 transition-colors ${
        danger
          ? "hover:bg-red-500 hover:text-white"
          : "hover:bg-neutral-100 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

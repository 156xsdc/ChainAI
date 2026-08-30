/**
 * 根组件：三栏布局 + 初始化 + 快捷键 + 错误提示
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { useChatStore } from "./store/chatStore";
import { useUIStore } from "./store/uiStore";
import { ChatArea } from "./components/chat/ChatArea";
import { Rail } from "./components/layout/Rail";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { RightSidebar } from "./components/layout/RightSidebar";

export default function App() {
  const init = useChatStore((s) => s.init);
  const initError = useChatStore((s) => s.initError);
  const uiError = useChatStore((s) => s.uiError);
  const clearError = useChatStore((s) => s.clearError);
  const leftExpanded = useUIStore((s) => s.leftExpanded);
  const rightExpanded = useUIStore((s) => s.rightExpanded);

  useEffect(() => {
    init();
  }, [init]);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ui = useUIStore.getState();
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        ui.toggleSidebar("left");
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        ui.toggleSidebar("right");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (initError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f5]">
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <div className="mb-2 text-3xl">⚠️</div>
          <div className="mb-1 text-sm font-medium text-neutral-800">
            初始化失败
          </div>
          <div className="text-xs leading-relaxed text-neutral-500">
            {initError}
          </div>
          <div className="mt-3 text-[11px] text-neutral-400">
            请通过 <code className="rounded bg-neutral-100 px-1">npm run tauri dev</code> 启动完整桌面环境
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f5] text-neutral-800">
      {leftExpanded ? <LeftSidebar /> : <Rail side="left" />}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatArea />
      </main>
      {rightExpanded ? <RightSidebar /> : <Rail side="right" />}

      {/* 左下角软提醒 */}
      {uiError && <ErrorToast message={uiError} onClose={clearError} />}
    </div>
  );
}

function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-[380px] items-start gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <span className="text-xs leading-relaxed text-neutral-600">{message}</span>
      <button
        className="mt-0.5 shrink-0 text-neutral-300 hover:text-neutral-500"
        onClick={onClose}
      >
        <X size={12} />
      </button>
    </div>
  );
}

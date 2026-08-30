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
import { GraphPanel } from "./components/graph/GraphPanel";
import { GraphFullscreen } from "./components/graph/GraphFullscreen";
import { SearchDialog } from "./components/modals/SearchDialog";

export default function App() {
  const init = useChatStore((s) => s.init);
  const initError = useChatStore((s) => s.initError);
  const uiError = useChatStore((s) => s.uiError);
  const notice = useChatStore((s) => s.notice);
  const noticeTone = useChatStore((s) => s.noticeTone);
  const notifyDuration = useChatStore((s) => s.notifyDuration);
  const clearError = useChatStore((s) => s.clearError);
  const clearNotice = useChatStore((s) => s.clearNotice);
  const leftExpanded = useUIStore((s) => s.leftExpanded);
  const rightExpanded = useUIStore((s) => s.rightExpanded);
  const graphOpen = useUIStore((s) => s.graphOpen);
  const graphFullscreen = useUIStore((s) => s.graphFullscreen);

  useEffect(() => {
    init();
  }, [init]);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ui = useUIStore.getState();
      if (e.key === "Escape") {
        if (ui.graphFullscreen) {
          e.preventDefault();
          ui.setGraphFullscreen(false);
        }
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        ui.setGraphFullscreen(!ui.graphFullscreen);
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        ui.toggleSidebar("left");
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        ui.toggleSidebar("right");
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void useChatStore.getState().createBlankNote();
      } else if (e.ctrlKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        void useChatStore.getState().exportData();
      } else if (e.ctrlKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        void useChatStore.getState().importData();
      } else if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        ui.setSearchOpen(!ui.searchOpen);
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
      {graphOpen && !graphFullscreen && <GraphPanel />}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatArea />
      </main>
      {rightExpanded ? <RightSidebar /> : <Rail side="right" />}

      {/* 树状图全屏 */}
      <GraphFullscreen />

      {/* 全局搜索 */}
      <SearchDialog />

      {/* 左下角软提醒 */}
      {uiError && (
        <SoftToast
          message={uiError}
          tone="error"
          duration={notifyDuration}
          onClose={clearError}
        />
      )}
      {notice && (
        <SoftToast
          message={notice}
          tone={noticeTone}
          duration={notifyDuration}
          onClose={clearNotice}
        />
      )}
    </div>
  );
}

function SoftToast({
  message,
  tone,
  duration,
  onClose,
}: {
  message: string;
  tone: "error" | "success" | "info";
  duration: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, Math.max(2, duration) * 1000);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  const textColor =
    tone === "error"
      ? "text-red-600"
      : tone === "success"
        ? "text-neutral-700"
        : "text-neutral-600";

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-[420px] items-start gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <span className={`text-xs leading-relaxed ${textColor}`}>{message}</span>
      <button
        className="mt-0.5 shrink-0 text-neutral-300 hover:text-neutral-500"
        onClick={onClose}
      >
        <X size={12} />
      </button>
    </div>
  );
}

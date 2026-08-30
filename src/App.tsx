/**
 * 根组件：三栏布局 + 初始化 + 快捷键 + 错误提示
 */
import { Component, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useChatStore } from "./store/chatStore";
import { useUIStore } from "./store/uiStore";
import { ChatArea } from "./components/chat/ChatArea";
import { Rail } from "./components/layout/Rail";
import { TitleBar } from "./components/layout/TitleBar";
import { FavoritesPanel } from "./components/layout/FavoritesPanel";
import { RightSidebar } from "./components/layout/RightSidebar";
import { GraphPanel } from "./components/graph/GraphPanel";
import { GraphFullscreen } from "./components/graph/GraphFullscreen";
import { SearchDialog } from "./components/modals/SearchDialog";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { PromptDialog } from "./components/common/PromptDialog";

export default function App() {
  const init = useChatStore((s) => s.init);
  const initError = useChatStore((s) => s.initError);
  const uiError = useChatStore((s) => s.uiError);
  const notice = useChatStore((s) => s.notice);
  const noticeTone = useChatStore((s) => s.noticeTone);
  const notifyDuration = useChatStore((s) => s.notifyDuration);
  const clearError = useChatStore((s) => s.clearError);
  const clearNotice = useChatStore((s) => s.clearNotice);
  const leftPanel = useUIStore((s) => s.leftPanel);
  const rightExpanded = useUIStore((s) => s.rightExpanded);
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
        ui.toggleLeftPanel("graph");
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        ui.setSidebar("right", !ui.rightExpanded);
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
    <ErrorBoundary>
      <AppContent
        leftPanel={leftPanel}
        rightExpanded={rightExpanded}
        graphFullscreen={graphFullscreen}
        uiError={uiError}
        notice={notice}
        noticeTone={noticeTone}
        notifyDuration={notifyDuration}
        clearError={clearError}
        clearNotice={clearNotice}
      />
    </ErrorBoundary>
  );
}

function AppContent({
  leftPanel,
  rightExpanded,
  graphFullscreen,
  uiError,
  notice,
  noticeTone,
  notifyDuration,
  clearError,
  clearNotice,
}: {
  leftPanel: "graph" | "favorites" | null;
  rightExpanded: boolean;
  graphFullscreen: boolean;
  uiError: string | null;
  notice: string | null;
  noticeTone: "success" | "info" | "error";
  notifyDuration: number;
  clearError: () => void;
  clearNotice: () => void;
}) {
  // 专注模式：树状图 + 便签并排（无聊天区）
  const focusPair = leftPanel === "graph" && rightExpanded && !graphFullscreen;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f5f5] text-neutral-800">
      {/* 自定义标题栏（替换系统标题栏） */}
      <TitleBar />
      <div className="flex min-h-0 flex-1">
      <Rail side="left" />
      {leftPanel === "graph" && !graphFullscreen && (
        <GraphPanel flexible={focusPair} />
      )}
      {leftPanel === "favorites" && <FavoritesPanel />}
      {/* 专注模式（树+便签并排）时隐藏聊天区 */}
      {!focusPair && (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatArea />
        </main>
      )}
      {rightExpanded ? <RightSidebar /> : <Rail side="right" />}
      </div>

      {/* 树状图全屏 */}
      <GraphFullscreen />

      {/* 全局搜索 */}
      <SearchDialog />

      {/* 全局对话框（确认 / 输入） */}
      <ConfirmDialog />
      <PromptDialog />

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

/**
 * 错误边界：渲染崩溃时显示错误信息（避免白屏）
 * 同时把错误写入日志文件（文档/chainai-error.log），便于定位
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    void (async () => {
      try {
        const { documentDir } = await import("@tauri-apps/api/path");
        const { invoke } = await import("@tauri-apps/api/core");
        const dir = await documentDir();
        const content = `[${new Date().toISOString()}]\n${error.message}\n${error.stack ?? ""}\n${JSON.stringify(info)}\n\n`;
        await invoke("append_text_file", {
          path: `${dir}/chainai-error.log`,
          content,
        });
      } catch {
        // 日志写入失败忽略
      }
    })();
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-[#f5f5f5]">
          <div className="max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-2 text-3xl">⚠️</div>
            <div className="mb-1 text-sm font-medium text-neutral-800">
              界面渲染出错
            </div>
            <pre className="max-h-52 overflow-auto rounded-lg bg-neutral-50 p-3 text-[11px] leading-relaxed text-red-600">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
            <button
              className="mt-3 rounded-xl bg-neutral-800 px-4 py-2 text-xs text-white hover:bg-neutral-700"
              onClick={() => this.setState({ error: null })}
            >
              尝试恢复
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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

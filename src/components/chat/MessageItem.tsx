/**
 * 单条消息：用户（浅灰气泡）/ AI（Markdown 全文）
 * AI 消息 hover 时底部弹出操作条：版本切换 / 重新生成 / 复制 / 收藏
 */
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Quote,
  RefreshCw,
  Star,
} from "lucide-react";
import type { ChatStreamItem } from "../../store/chatStore";
import { useChatStore } from "../../store/chatStore";
import { Markdown } from "./Markdown";

interface MessageItemProps {
  item: Extract<ChatStreamItem, { kind: "message" }>;
  isStreaming?: boolean;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
}

export const MessageItem = memo(function MessageItem({
  item,
  isStreaming,
  onContextMenu,
}: MessageItemProps) {
  const repos = useChatStore((s) => s.repos);
  const streaming = useChatStore((s) => s.streaming);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const setNotice = useChatStore((s) => s.setNotice);
  const setQuote = useChatStore((s) => s.setQuote);
  const regenerate = useChatStore((s) => s.regenerate);
  const switchAnswer = useChatStore((s) => s.switchAnswer);

  // 版本信息（当前版本号 + 总数），用于切换箭头
  const [verInfo, setVerInfo] = useState<{ current: number; total: number } | null>(null);
  // 引用弹窗：选中 AI 回答文本后弹出
  const msgRef = useRef<HTMLDivElement>(null);
  const [quotePopup, setQuotePopup] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  // 点击其他位置关闭引用弹窗
  useEffect(() => {
    if (!quotePopup) return;
    const close = () => setQuotePopup(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [quotePopup]);

  /** AI 消息内选中文本 → 弹出引用按钮 */
  const handleMouseUp = () => {
    if (item.role !== "assistant" || isStreaming) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text || text.length < 2) return;
    const container = msgRef.current;
    if (!container) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    setQuotePopup({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text,
    });
  };

  /** 引用：把选中内容钉到输入框 */
  const handleQuote = () => {
    if (!quotePopup) return;
    setQuote({ nodeId: item.nodeId, text: quotePopup.text });
    window.getSelection()?.removeAllRanges();
    setQuotePopup(null);
    setNotice("📎 已引用，可在输入框继续提问");
  };

  useEffect(() => {
    // 流式期间版本信息不参与渲染（箭头已隐藏），跳过查询避免每次增量都查库
    if (isStreaming) return;
    let cancelled = false;
    if (!repos) return;
    void (async () => {
      const [versions, node] = await Promise.all([
        repos.answerVersions.list(item.nodeId),
        repos.nodes.getNode(item.nodeId),
      ]);
      if (cancelled) return;
      setVerInfo({
        current: node?.answerVersion ?? 1,
        total: versions.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos, item.nodeId, item.content, isStreaming]);

  if (item.role === "user") {
    return (
      <div
        className="flex justify-end"
        onContextMenu={(e) => onContextMenu(e, item.nodeId)}
      >
        <div className="max-w-[82%]">
          <div
            className="select-text rounded-2xl border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-[13.5px] leading-relaxed text-neutral-800"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {item.content}
          </div>
          {/* 引用内容：钉在发送的消息下方，单行截断 */}
          {item.quote && (
            <div
              className="mt-1 flex select-text items-center gap-1.5 rounded-lg border border-neutral-200 border-l-2 border-l-neutral-400 bg-neutral-50 px-2.5 py-1.5"
              title={item.quote}
            >
              <Quote size={10} className="shrink-0 text-neutral-400" />
              <span className="truncate text-[11px] leading-relaxed text-neutral-500">
                {item.quote}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleCopyMarkdown = async () => {
    const node = await repos?.nodes.getNode(item.nodeId);
    const text = node?.answer ?? item.content;
    await navigator.clipboard.writeText(text);
    setNotice("📋 已复制 Markdown 原文");
  };

  const hasVersions = (verInfo?.total ?? 0) > 1;

  return (
    <div
      ref={msgRef}
      className="group/msg relative"
      onContextMenu={(e) => onContextMenu(e, item.nodeId)}
      onMouseUp={handleMouseUp}
    >
      {isStreaming ? (
        // 流式期间用纯文本渲染（省 CPU），结束后统一渲染 Markdown
        <div className="whitespace-pre-wrap text-[13.5px] leading-7 text-neutral-800">
          {item.content}
          <StreamingCursor />
        </div>
      ) : (
        <Markdown content={item.content} />
      )}

      {/* 选中文本后弹出的引用按钮 */}
      {quotePopup && (
        <div
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 shadow-lg"
          style={{
            top: Math.max(8, quotePopup.y - 42),
            left: Math.min(
              Math.max(70, quotePopup.x),
              window.innerWidth - 70
            ),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Quote size={12} className="shrink-0 text-neutral-500" />
          <button
            className="whitespace-nowrap text-xs font-medium text-neutral-700 hover:text-neutral-900"
            onClick={handleQuote}
          >
            引用
          </button>
        </div>
      )}

      {/* hover 底部操作条 */}
      <div className="pointer-events-none absolute -bottom-3 right-0 z-10 flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100">
        {/* 版本切换箭头 */}
        {hasVersions && !streaming && (
          <>
            <button
              className="flex h-6 items-center rounded-full pl-1 pr-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              title="上一个版本"
              disabled={verInfo!.current <= 1}
              onClick={() => void switchAnswer(item.nodeId, -1)}
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-[9px] text-neutral-400">
              {verInfo!.current}/{verInfo!.total}
            </span>
            <button
              className="flex h-6 items-center rounded-full pl-0.5 pr-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              title="下一个版本"
              disabled={verInfo!.current >= verInfo!.total}
              onClick={() => void switchAnswer(item.nodeId, 1)}
            >
              <ChevronRight size={12} />
            </button>
          </>
        )}
        {/* 重新生成 */}
        <button
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40"
          title="重新生成（保留历史版本）"
          disabled={streaming}
          onClick={() => void regenerate(item.nodeId)}
        >
          <RefreshCw size={11.5} />
        </button>
        <button
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          title="复制为 Markdown"
          onClick={() => void handleCopyMarkdown()}
        >
          <Copy size={12} />
        </button>
        <button
          className={`flex h-6 w-6 items-center justify-center rounded-full hover:bg-neutral-100 ${
            item.isFavorited
              ? "text-amber-500"
              : "text-neutral-400 hover:text-neutral-700"
          }`}
          title={item.isFavorited ? "取消收藏" : "收藏"}
          onClick={() => void toggleFavorite(item.nodeId)}
        >
          <Star size={12} fill={item.isFavorited ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
});

function StreamingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse rounded-[1px] bg-neutral-400 align-text-bottom"
      style={{ animationDuration: "0.8s" } as CSSProperties}
    />
  );
}

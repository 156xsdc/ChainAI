/**
 * 单条消息：用户（浅灰气泡）/ AI（Markdown 全文）
 * AI 消息 hover 时底部弹出操作条：版本切换 / 重新生成 / 复制 / 收藏
 */
import { memo, useEffect, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
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
  const regenerate = useChatStore((s) => s.regenerate);
  const switchAnswer = useChatStore((s) => s.switchAnswer);

  // 版本信息（当前版本号 + 总数），用于切换箭头
  const [verInfo, setVerInfo] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
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
  }, [repos, item.nodeId, item.content]);

  if (item.role === "user") {
    return (
      <div
        className="flex justify-end"
        onContextMenu={(e) => onContextMenu(e, item.nodeId)}
      >
        <div
          className="max-w-[82%] rounded-2xl border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-[13.5px] leading-relaxed text-neutral-800"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {item.content}
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
      className="group/msg relative"
      onContextMenu={(e) => onContextMenu(e, item.nodeId)}
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

/**
 * 单条消息：用户（浅灰气泡）/ AI（Markdown 全文）
 * AI 消息 hover 时底部弹出操作条：复制 Markdown / 收藏
 */
import { memo, type CSSProperties } from "react";
import { Copy, Star } from "lucide-react";
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
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const setNotice = useChatStore((s) => s.setNotice);

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
        <button
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          title="复制为 Markdown"
          onClick={() => void handleCopyMarkdown()}
        >
          <Copy size={12} />
        </button>
        <button
          className={`flex h-6 w-6 items-center justify-center rounded-full hover:bg-neutral-100 ${
            item.isFavorited ? "text-amber-500" : "text-neutral-400 hover:text-neutral-700"
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

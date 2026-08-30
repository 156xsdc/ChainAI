/**
 * 单条消息：用户（浅灰气泡）/ AI（Markdown 全文）
 */
import { memo, type CSSProperties } from "react";
import type { ChatStreamItem } from "../../store/chatStore";
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

  return (
    <div
      className="group/msg"
      onContextMenu={(e) => onContextMenu(e, item.nodeId)}
    >
      {isStreaming ? (
        // 流式期间用纯文本渲染（省 CPU），结束后统一渲染 Markdown
        <div className="text-[13.5px] leading-7 text-neutral-800 whitespace-pre-wrap">
          {item.content}
          <StreamingCursor />
        </div>
      ) : (
        <Markdown content={item.content} />
      )}
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

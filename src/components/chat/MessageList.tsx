/**
 * 消息流：线性渲染 + 分叉点插入分支提示线
 * 滚动到底部（AI 生成时跟随）
 */
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { MessageItem } from "./MessageItem";
import { BranchDivider } from "./BranchDivider";
import { ContextMenu } from "./ContextMenu";

export function MessageList() {
  const path = useChatStore((s) => s.path);
  const streaming = useChatStore((s) => s.streaming);
  const streamingBuffer = useChatStore((s) => s.streamingBuffer);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const createBranch = useChatStore((s) => s.createBranch);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  // 消息变化 / 流式输出时滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [path, streamingBuffer]);

  if (path.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400 select-none">
        <div className="text-4xl">✨</div>
        <div className="text-sm">开始第一次对话</div>
        <div className="text-xs">在下方输入消息，对话将以树状结构保存</div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto"
      onClick={() => setMenu(null)}
      onContextMenu={(e) => {
        // 空白处右键：关闭菜单
        if ((e.target as HTMLElement).closest("[data-message]") === null) {
          setMenu(null);
        }
      }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-8">
        {path.map((item, i) => {
          const isLast = i === path.length - 1;
          if (item.kind === "message") {
            const isStreamingThis =
              isLast && streaming && item.role === "assistant";
            return (
              <div key={`${item.nodeId}-${item.role}-${i}`} data-message>
                <MessageItem
                  item={item}
                  isStreaming={isStreamingThis}
                  onContextMenu={(e, nodeId) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, nodeId });
                  }}
                />
              </div>
            );
          }
          return (
            <BranchDivider
              key={`branch-${item.parentNodeId}-${i}`}
              parentNodeId={item.parentNodeId}
              children={item.children}
              onSelect={(nodeId) => navigateTo(nodeId)}
              onAddBranch={(parentId) => {
                createBranch(parentId, {});
                setMenu(null);
              }}
            />
          );
        })}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          nodeId={menu.nodeId}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/**
 * 消息流：线性渲染 + 分叉点插入分支提示线
 * 滚动到底部（AI 生成时跟随）
 */
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { promptDialog } from "../../store/dialogStore";
import { MessageItem } from "./MessageItem";
import { BranchDivider } from "./BranchDivider";
import { MergeDivider } from "./MergeDivider";
import { ContextMenu } from "./ContextMenu";
import { Modal } from "../common/Modal";

export function MessageList() {
  const path = useChatStore((s) => s.path);
  const streaming = useChatStore((s) => s.streaming);
  const preparing = useChatStore((s) => s.preparing);
  const currentNodeId = useChatStore((s) => s.currentNodeId);
  const streamingBuffer = useChatStore((s) => s.streamingBuffer);
  const repos = useChatStore((s) => s.repos);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const createBranch = useChatStore((s) => s.createBranch);
  const deleteBranch = useChatStore((s) => s.deleteBranch);
  const renameBranch = useChatStore((s) => s.renameBranch);

  /** 重命名分支 */
  const handleRenameBranch = async (nodeId: string) => {
    const name = await promptDialog({
      title: "重命名分支",
      placeholder: "分支名称",
    });
    if (name === null) return;
    await renameBranch(nodeId, name);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    nodeId: string;
    label: string;
    nodeCount: number;
    protectedCount: number;
    busy: boolean;
  } | null>(null);

  /** 打开删除确认：统计子树节点数与受保护节点数 */
  const openDeleteConfirm = async (nodeId: string, label: string) => {
    if (!repos) return;
    const descendants = await repos.nodes.getDescendantIds(nodeId);
    let protectedCount = 0;
    for (const id of descendants) {
      const n = await repos.nodes.getNode(id);
      if (n && (n.isKept || n.isFavorited)) protectedCount++;
      const notes = await repos.notes.listByNode(id);
      if (notes.length > 0) protectedCount++;
    }
    setDeleteConfirm({
      nodeId,
      label,
      nodeCount: descendants.length,
      protectedCount,
      busy: false,
    });
  };

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
      className="min-h-0 flex-1 overflow-y-auto"
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
            // 动态合并流式内容（重新生成/版本切换时 streamingBuffer 覆盖显示）
            // 注意：只覆盖 AI 消息——用户提问与 AI 回答同属一个节点（同 nodeId）
            const streamed =
              item.role === "assistant"
                ? streamingBuffer[item.nodeId]
                : undefined;
            const displayItem =
              streamed !== undefined
                ? { ...item, content: streamed }
                : item;
            return (
              <div key={`${item.nodeId}-${item.role}-${i}`} data-message>
                <MessageItem
                  item={displayItem}
                  isStreaming={isStreamingThis}
                  onContextMenu={(e, nodeId) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, nodeId });
                  }}
                />
              </div>
            );
          }
          if (item.kind === "merge") {
            return (
              <MergeDivider
                key={`merge-${item.nodeId}-${i}`}
                options={item.options}
                onSelect={(nodeId) => navigateTo(nodeId)}
              />
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
              onDeleteBranch={(nodeId, label) => void openDeleteConfirm(nodeId, label)}
              onRenameBranch={(nodeId) => void handleRenameBranch(nodeId)}
            />
          );
        })}

        {/* 发送中的状态：准备上下文 / AI 生成（打字机）
            仅当当前节点的 AI 消息尚未出现在消息流中（发送新消息），
            重新生成现有节点时消息流内已实时显示，避免重复 */}
        {(preparing || streaming) &&
          currentNodeId &&
          !path.some(
            (it) =>
              it.kind === "message" &&
              it.role === "assistant" &&
              it.nodeId === currentNodeId
          ) && (
          <div key="generating" data-message>
            {preparing ? (
              <div className="flex items-center gap-2 py-1 text-xs text-neutral-400">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
                正在准备上下文（压缩历史消息）...
              </div>
            ) : (
              <MessageItem
                item={{
                  kind: "message",
                  role: "assistant",
                  nodeId: currentNodeId,
                  content: streamingBuffer[currentNodeId] ?? "",
                }}
                isStreaming
                onContextMenu={(e, nodeId) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, nodeId });
                }}
              />
            )}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          nodeId={menu.nodeId}
          onClose={() => setMenu(null)}
        />
      )}

      {/* 删除分支确认 */}
      <Modal
        open={deleteConfirm !== null}
        title="删除分支"
        onClose={() => setDeleteConfirm(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-neutral-50 px-3.5 py-3 text-xs leading-relaxed text-neutral-600">
            确定删除分支 <b>「{deleteConfirm?.label}」</b> 吗？
            <br />
            将删除该分支及其下全部对话（
            <b>{deleteConfirm?.nodeCount}</b> 个节点），移入回收站。
          </div>
          {deleteConfirm && deleteConfirm.protectedCount > 0 && (
            <div className="rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-700">
              ⚠️ 该分支包含 <b>{deleteConfirm.protectedCount}</b> 个受保护节点
              （⭐收藏 / 📌保留 / 📝便签关联）。
              <br />
              如需删除，请先取消这些节点的保护标记。
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="rounded-xl px-4 py-2 text-xs text-neutral-500 hover:bg-neutral-100"
            >
              取消
            </button>
            <button
              disabled={
                !deleteConfirm ||
                deleteConfirm.busy ||
                deleteConfirm.protectedCount > 0
              }
              onClick={async () => {
                if (!deleteConfirm) return;
                setDeleteConfirm({ ...deleteConfirm, busy: true });
                await deleteBranch(deleteConfirm.nodeId);
                setDeleteConfirm(null);
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

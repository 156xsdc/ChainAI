/**
 * 左侧边栏（完全展开 250px）
 * 上半：树状图缩略图（占位）｜中部：收藏夹｜底部：设置 + 收起
 */
import { useEffect, useState } from "react";
import { Bookmark, ChevronsLeft, Settings, Star, TreePine } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { SettingsDialog } from "../modals/SettingsDialog";
import type { TreeNode } from "../../core/db";

export function LeftSidebar() {
  const setSidebar = useUIStore((s) => s.setSidebar);
  const repos = useChatStore((s) => s.repos);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const [favorites, setFavorites] = useState<TreeNode[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!repos) return;
    (async () => {
      const favs = await repos.favorites.getAll();
      const nodes: TreeNode[] = [];
      for (const f of favs) {
        const n = await repos.nodes.getNode(f.nodeId);
        if (n) nodes.push(n);
      }
      if (!cancelled) setFavorites(nodes);
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-neutral-200 bg-white">
      {/* 树状图缩略图区 */}
      <div className="flex min-h-0 flex-[3] flex-col border-b border-neutral-100 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <TreePine size={12} /> 树状图
        </div>
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 text-center text-[11px] text-neutral-300">
          <TreePine size={22} strokeWidth={1} className="mb-2 text-neutral-200" />
          树状图缩略图
          <br />
          （下一阶段接入）
        </div>
      </div>

      {/* 收藏夹 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <Star size={12} /> 收藏夹
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {favorites.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-neutral-300">
              暂无收藏
              <br />
              （右键消息可收藏）
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {favorites.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigateTo(n.id)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100"
                  title={n.question}
                >
                  <Bookmark size={11} className="shrink-0 text-neutral-300" />
                  <span className="truncate">
                    {n.question.slice(0, 20) || "未命名节点"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部：设置 + 收起 */}
      <div className="flex items-center justify-between border-t border-neutral-100 p-2">
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={13} /> 设置
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          onClick={() => setSidebar("left", false)}
          title="收起 (Ctrl+B)"
        >
          <ChevronsLeft size={13} />
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

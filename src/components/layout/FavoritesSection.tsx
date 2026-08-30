/**
 * 收藏夹（分组管理）：收藏分组 + 未分组收藏
 * - 新建分组、收藏移动到分组、编辑备注、取消收藏
 */
import { useEffect, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Star,
} from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { Favorite, FavoriteGroup, TreeNode } from "../../core/db";

interface FavItem extends Favorite {
  node: TreeNode | null;
}

const GROUP_COLORS = ["#1a1a1a", "#b45309", "#5b5bd6", "#0f766e", "#b91c1c", "#4d7c0f"];

export function FavoritesSection() {
  const repos = useChatStore((s) => s.repos);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const setNotice = useChatStore((s) => s.setNotice);
  const favVersion = useChatStore((s) => s.favVersion);
  const [groups, setGroups] = useState<FavoriteGroup[]>([]);
  const [favs, setFavs] = useState<FavItem[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    fav: FavItem;
  } | null>(null);
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenu(null), menu !== null);

  const load = async () => {
    if (!repos) return;
    const [g, f] = await Promise.all([
      repos.favorites.listGroups(),
      repos.favorites.getAll(),
    ]);
    setGroups(g);
    const items: FavItem[] = [];
    for (const fav of f) {
      const node = await repos.nodes.getNode(fav.nodeId);
      items.push({ ...fav, node });
    }
    setFavs(items);
  };

  useEffect(() => {
    void load();
  }, [repos, favVersion]);

  const createGroup = async () => {
    if (!repos) return;
    const name = window.prompt("分组名称", "新收藏分组");
    if (name === null) return;
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    await repos.favorites.createGroup(name.trim() || "未命名分组", color);
    setNotice(`📦 已创建收藏分组「${name.trim()}」`);
    void load();
  };

  const moveFav = async (favId: string, groupId: string | null) => {
    if (!repos) return;
    await repos.favorites.moveToGroup(favId, groupId);
    setMenu(null);
    void load();
  };

  const editNote = async (fav: FavItem) => {
    if (!repos) return;
    const note = window.prompt("收藏备注", fav.note);
    if (note === null) return;
    await repos.favorites.updateNote(fav.id, note);
    setMenu(null);
    void load();
  };

  const recolorGroup = async (group: FavoriteGroup) => {
    if (!repos) return;
    const color = window.prompt("分组颜色（HEX）", group.color);
    if (color === null) return;
    await repos.backend.execute(
      `UPDATE favorite_groups SET color = ? WHERE id = ?`,
      [color.trim(), group.id]
    );
    void load();
  };

  const deleteGroup = async (groupId: string) => {
    if (!repos) return;
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    if (!window.confirm(`删除分组「${g.name}」？组内收藏将移到未分组（收藏不会删除）`)) return;
    await repos.favorites.deleteGroup(groupId);
    setNotice("🗑️ 已删除收藏分组");
    void load();
  };

  const renderItem = (fav: FavItem) => (
    <div
      key={fav.id}
      className="group/fav relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-neutral-100"
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onClick={() => fav.node && navigateTo(fav.node.id)}
        title={fav.node?.question}
      >
        <Bookmark size={11} className="shrink-0 text-neutral-300" />
        <span className="truncate text-xs text-neutral-600">
          {fav.node?.question.slice(0, 18) || "已删除节点"}
        </span>
        {fav.note && (
          <span className="shrink-0 text-[9px] text-neutral-400">📝</span>
        )}
      </button>
      <button
        className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 hover:bg-neutral-200 hover:text-neutral-600 group-hover/fav:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY, fav });
        }}
      >
        <MoreHorizontal size={11} />
      </button>
    </div>
  );

  const ungrouped = favs.filter((f) => !f.groupId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
        <Star size={12} /> 收藏夹
        <span className="ml-auto text-[9px] text-neutral-300">
          {favs.length} 项
        </span>
      </div>

      {/* 新建分组（明确入口） */}
      <button
        className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 py-1.5 text-[11px] text-neutral-500 hover:border-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
        onClick={() => void createGroup()}
      >
        <Plus size={12} /> 新建收藏分组
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {favs.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-neutral-300">
            暂无收藏
            <br />
            （右键消息可收藏）
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* 分组 */}
            {groups.map((g) => {
              const members = favs.filter((f) => f.groupId === g.id);
              const open = !collapsed.has(g.id);
              return (
                <div key={g.id}>
                  <div className="group/g flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-neutral-50">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5"
                      onClick={() =>
                        setCollapsed((s) => {
                          const next = new Set(s);
                          if (next.has(g.id)) next.delete(g.id);
                          else next.add(g.id);
                          return next;
                        })
                      }
                    >
                      {open ? (
                        <ChevronDown size={11} className="shrink-0 text-neutral-400" />
                      ) : (
                        <ChevronRight size={11} className="shrink-0 text-neutral-400" />
                      )}
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: g.color }}
                      />
                      <span className="truncate text-xs font-medium text-neutral-700">
                        {g.name}
                      </span>
                      <span className="shrink-0 text-[9px] text-neutral-400">
                        {members.length}
                      </span>
                    </button>
                    <button
                      className="shrink-0 rounded px-1 text-[9px] text-neutral-300 opacity-0 hover:text-neutral-600 group-hover/g:opacity-100"
                      title="修改颜色"
                      onClick={() => void recolorGroup(g)}
                    >
                      颜色
                    </button>
                    <button
                      className="shrink-0 rounded px-1 text-[9px] text-neutral-300 opacity-0 hover:text-red-500 group-hover/g:opacity-100"
                      title="删除分组"
                      onClick={() => void deleteGroup(g.id)}
                    >
                      删除
                    </button>
                  </div>
                  {open && (
                    <div className="ml-3 border-l border-neutral-100 pl-1">
                      {members.length === 0 && (
                        <div className="px-2 py-1 text-[10px] text-neutral-300">
                          空分组
                        </div>
                      )}
                      {members.map(renderItem)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 未分组 */}
            {ungrouped.length > 0 && (
              <div>
                {groups.length > 0 && (
                  <div className="px-1.5 pb-0.5 pt-1 text-[10px] text-neutral-400">
                    未分组
                  </div>
                )}
                {ungrouped.map(renderItem)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 收藏项菜单 */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          style={{ top: menu.y, left: Math.min(menu.x, window.innerWidth - 190) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-neutral-400">
            移动到分组
          </div>
          <button
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
            onClick={() => void moveFav(menu.fav.id, null)}
          >
            未分组
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
              onClick={() => void moveFav(menu.fav.id, g.id)}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
              {g.name}
            </button>
          ))}
          <div className="my-1 h-px bg-neutral-100" />
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
            onClick={() => void editNote(menu.fav)}
          >
            编辑备注
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
            onClick={() => {
              void toggleFavorite(menu.fav.nodeId);
              setMenu(null);
            }}
          >
            取消收藏
          </button>
        </div>
      )}
    </div>
  );
}

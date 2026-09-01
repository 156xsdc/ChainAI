/**
 * 收藏夹（分组管理）：收藏分组 + 未分组收藏
 * - 新建分组、收藏移动到分组、编辑备注、取消收藏
 */
import { useEffect, useState } from "react";
import {
  Bookmark,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  MoreHorizontal,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useClickOutside } from "../../hooks/useClickOutside";
import { confirmDialog, promptDialog } from "../../store/dialogStore";
import { ColorDialog } from "../common/ColorDialog";
import { chooseDirectory } from "../../core/io/files";
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
  /** 批量选择模式 */
  const [batchMode, setBatchMode] = useState(false);
  const [selectedFavs, setSelectedFavs] = useState<Set<string>>(new Set());
  const [colorDialog, setColorDialog] = useState<FavoriteGroup | null>(null);

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
    const name = await promptDialog({
      title: "新建收藏分组",
      defaultValue: "新收藏分组",
    });
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
    const note = await promptDialog({
      title: "编辑收藏备注",
      defaultValue: fav.note,
      placeholder: "备注内容",
    });
    if (note === null) return;
    await repos.favorites.updateNote(fav.id, note);
    setMenu(null);
    void load();
  };

  const recolorGroup = (group: FavoriteGroup) => {
    setColorDialog(group);
  };

  const deleteGroup = async (groupId: string) => {
    if (!repos) return;
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const ok = await confirmDialog({
      title: "删除收藏分组",
      message: `确定删除分组「${g.name}」？\n组内收藏将移到「未分组」（收藏不会被删除）`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await repos.favorites.deleteGroup(groupId);
    setNotice("🗑️ 已删除收藏分组");
    void load();
  };

  const renderItem = (fav: FavItem) => (
    <div
      key={fav.id}
      className={`group/fav relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left ${
        batchMode && selectedFavs.has(fav.id) ? "bg-neutral-100" : "hover:bg-neutral-100"
      }`}
    >
      {batchMode ? (
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onClick={() =>
            setSelectedFavs((s) => {
              const next = new Set(s);
              if (next.has(fav.id)) next.delete(fav.id);
              else next.add(fav.id);
              return next;
            })
          }
          title={fav.node?.question}
        >
          {selectedFavs.has(fav.id) ? (
            <CheckSquare size={13} className="shrink-0 text-neutral-700" />
          ) : (
            <Square size={13} className="shrink-0 text-neutral-300" />
          )}
          <span className="truncate text-xs text-neutral-600">
            {fav.node?.question.slice(0, 18) || "已删除节点"}
          </span>
        </button>
      ) : (
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
      )}
      {!batchMode && (
        <button
          className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 hover:bg-neutral-200 hover:text-neutral-600 group-hover/fav:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY, fav });
          }}
        >
          <MoreHorizontal size={11} />
        </button>
      )}
    </div>
  );

  /** 批量删除：取消选中的收藏 */
  const handleBatchDelete = async () => {
    if (selectedFavs.size === 0) return;
    const ok = await confirmDialog({
      title: "批量取消收藏",
      message: `确定取消选中 ${selectedFavs.size} 个收藏？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const targets = favs.filter((f) => selectedFavs.has(f.id));
    for (const f of targets) await toggleFavorite(f.nodeId);
    setNotice(`🗑️ 已取消 ${targets.length} 个收藏`);
    setSelectedFavs(new Set());
    setBatchMode(false);
    void load();
  };

  /** 批量导出：每个收藏单独一个 .md 文件（仅 AI 回答），自动建文件夹批量写入 */
  const handleBatchExport = async () => {
    if (selectedFavs.size === 0) return;
    const targets = favs.filter((f) => selectedFavs.has(f.id));
    // 选父目录 → 自动创建「收藏导出-时间」子文件夹
    const dir = await chooseDirectory();
    if (!dir) return;
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(":", "");
    const folderName = `收藏导出-${stamp}`;
    const { invoke } = await import("@tauri-apps/api/core");
    const { join } = await import("@tauri-apps/api/path");
    const usedNames = new Set<string>();
    /** 文件名清洗：去非法/控制字符、结尾点空格、Windows 保留名 */
    const cleanBase = (s: string): string => {
      let b = s
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
        .replace(/[. ]+$/g, "")
        .trim();
      // 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）加下划线前缀
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(b)) b = `_${b}`;
      return b || "收藏";
    };
    let exported = 0;
    let skipped = 0;
    let failed = 0;
    let failedNames: string[] = [];
    for (const f of targets) {
      const n = f.node;
      // 节点已删除 / 无回答的收藏无法导出——计数并跳过（明确提示）
      if (!n) {
        skipped++;
        continue;
      }
      if (!n.answer.trim()) {
        skipped++;
        continue;
      }
      // 文件名：问题前 15 字（清洗），重名加序号
      const base = cleanBase(n.question || "收藏").slice(0, 15);
      let name = `${base}.md`;
      let seq = 2;
      while (usedNames.has(name)) {
        name = `${base}(${seq}).md`;
        seq++;
      }
      usedNames.add(name);
      try {
        // write_text_file 会自动创建父目录（含子文件夹）
        await invoke("write_text_file", {
          path: await join(dir, folderName, name),
          content: n.answer.trim() + "\n",
        });
        exported++;
      } catch (e) {
        failed++;
        if (failedNames.length < 3) failedNames.push(name);
        console.error("导出失败", name, e);
      }
    }
    const extra =
      (skipped > 0 ? `；跳过 ${skipped} 项（无回答或节点已删除）` : "") +
      (failed > 0
        ? `；${failed} 项写入失败${
            failedNames.length > 0 ? `（如：${failedNames.join("、")}）` : ""
          }`
        : "");
    if (exported > 0) {
      setNotice(`✅ 已导出 ${exported} 个回答到：${dir}\\${folderName}${extra}`);
    } else if (skipped > 0 || failed > 0) {
      setNotice(`没有可导出的内容${extra}`);
    } else {
      setNotice("没有可导出的内容");
    }
    setBatchMode(false);
    void load();
  };

  const ungrouped = favs.filter((f) => !f.groupId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      {/* 批量模式操作条 */}
      {batchMode ? (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-500">
            已选 {selectedFavs.size}
          </span>
          <button
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-50 disabled:text-neutral-300"
            disabled={selectedFavs.size === 0}
            onClick={() => void handleBatchDelete()}
          >
            <span className="flex items-center gap-1">
              <Trash2 size={11} /> 删除
            </span>
          </button>
          <button
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-300"
            disabled={selectedFavs.size === 0}
            onClick={() => void handleBatchExport()}
          >
            <span className="flex items-center gap-1">
              <Download size={11} /> 导出
            </span>
          </button>
          <button
            className="shrink-0 rounded-md p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="退出批量模式"
            onClick={() => {
              setBatchMode(false);
              setSelectedFavs(new Set());
            }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <>
          {/* 新建分组（明确入口） */}
          <button
            className="mb-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 py-1.5 text-[11px] text-neutral-500 hover:border-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
            onClick={() => void createGroup()}
          >
            <Plus size={12} /> 新建收藏分组
          </button>
          {/* 批量管理入口 */}
          {favs.length > 0 && (
            <button
              className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[11px] text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
              onClick={() => {
                setBatchMode(true);
                setSelectedFavs(new Set());
              }}
            >
              <CheckSquare size={11} /> 批量管理
            </button>
          )}
        </>
      )}

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

      {/* 分组颜色对话框（预设色板 + 自定义） */}
      <ColorDialog
        open={colorDialog !== null}
        title="分组颜色"
        value={colorDialog?.color ?? "#1a1a1a"}
        onClose={() => setColorDialog(null)}
        onConfirm={(color) => {
          const g = colorDialog;
          if (!g || !repos) return;
          void (async () => {
            await repos.backend.execute(
              `UPDATE favorite_groups SET color = ? WHERE id = ?`,
              [color, g.id]
            );
            setNotice(`🎨 已应用颜色 ${color}`);
            setColorDialog(null);
            void load();
          })();
        }}
      />
    </div>
  );
}

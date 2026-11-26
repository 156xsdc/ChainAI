/**
 * 树批量管理：勾选多棵树 → 批量删除（节点进回收站，可恢复）
 * 入口：树状图面板左上角「树」菜单 → 批量管理…
 */
import { useEffect, useState } from "react";
import { FolderPlus, FolderMinus, Search, Trash2 } from "lucide-react";
import { Modal } from "../common/Modal";
import { useChatStore } from "../../store/chatStore";
import { confirmDialog, promptDialog } from "../../store/dialogStore";
import type { Tree } from "../../core/db";

interface TreeRow {
  tree: Tree;
  nodeCount: number;
}

export function TreeManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const repos = useChatStore((s) => s.repos);
  const currentTreeId = useChatStore((s) => s.currentTreeId);
  const deleteTrees = useChatStore((s) => s.deleteTrees);
  const setTreesFolder = useChatStore((s) => s.setTreesFolder);
  const switchTree = useChatStore((s) => s.switchTree);

  const [rows, setRows] = useState<TreeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);

  // 每次打开重新统计（节点数可能已变）
  useEffect(() => {
    if (!open || !repos) return;
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    setQuery("");
    void (async () => {
      const trees = await repos.trees.list();
      const withCounts: TreeRow[] = [];
      for (const tree of trees) {
        const nodes = await repos.nodes.getAllActive(tree.id);
        withCounts.push({ tree, nodeCount: nodes.length });
      }
      if (!cancelled) {
        setRows(withCounts);
        setFolders(await repos.trees.listFolders());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, repos]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => r.tree.name.toLowerCase().includes(q))
    : rows;
  const selectedRows = rows.filter((r) => selected.has(r.tree.id));
  const selectedNodes = selectedRows.reduce((sum, r) => sum + r.nodeCount, 0);
  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selected.has(r.tree.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of visible) next.delete(r.tree.id);
      } else {
        for (const r of visible) next.add(r.tree.id);
      }
      return next;
    });

  /** 归类：输入或选择已有分组名；留空 = 取消分类 */
  const handleGroup = async () => {
    if (selected.size === 0 || busy) return;
    const currentFolders = new Set(selectedRows.map((r) => r.tree.folder));
    const commonFolder =
      currentFolders.size === 1 ? [...currentFolders][0] ?? "" : "";
    const input = await promptDialog({
      title: `归类 ${selected.size} 棵树`,
      label: folders.length
        ? `分类名（留空 = 取消分类）\n已有：${folders.join(" / ")}`
        : "分类名（留空 = 取消分类）",
      defaultValue: commonFolder,
      placeholder: "例如：学术写作",
    });
    if (input === null) return;
    setBusy(true);
    await setTreesFolder([...selected], input);
    setBusy(false);
    setSelected(new Set());
    const trees = await repos!.trees.list();
    setRows(
      await Promise.all(
        trees.map(async (tree) => ({
          tree,
          nodeCount: (await repos!.nodes.getAllActive(tree.id)).length,
        }))
      )
    );
    setFolders(await repos!.trees.listFolders());
  };

  /** 取消分类：直接回到「未分类」，不需要输入 */
  const handleUngroup = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    await setTreesFolder([...selected], "");
    setBusy(false);
    setSelected(new Set());
    const trees = await repos!.trees.list();
    setRows(
      await Promise.all(
        trees.map(async (tree) => ({
          tree,
          nodeCount: (await repos!.nodes.getAllActive(tree.id)).length,
        }))
      )
    );
    setFolders(await repos!.trees.listFolders());
  };

  const handleDelete = async () => {
    if (selected.size === 0 || busy) return;
    const ok = await confirmDialog({
      title: `删除 ${selected.size} 棵树？`,
      message:
        `将删除 ${selected.size} 棵树，其中共 ${selectedNodes} 个节点会移入回收站（可恢复）。\n` +
        (selected.has(currentTreeId ?? "")
          ? "当前正在使用的树也在其中，删除后会切到剩余的树。"
          : ""),
      confirmText: "删除",
    });
    if (!ok) return;
    setBusy(true);
    await deleteTrees([...selected]);
    setBusy(false);
    onClose();
  };

  return (
    <Modal open={open} title="批量管理树" onClose={onClose} width={480}>
      <div className="flex flex-col gap-3">
        {/* 搜索 + 全选 */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 focus-within:border-neutral-400">
            <Search size={13} className="shrink-0 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛选树名…"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-300"
            />
          </div>
          <button
            onClick={toggleAll}
            disabled={visible.length === 0}
            className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
          >
            {allVisibleSelected ? "取消全选" : "全选"}
          </button>
        </div>

        {/* 列表 */}
        <div className="max-h-[46vh] min-h-[120px] overflow-y-auto rounded-xl border border-neutral-200">
          {loading && (
            <div className="px-3 py-6 text-center text-[11px] text-neutral-400">
              统计中…
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-neutral-400">
              没有匹配的树
            </div>
          )}
          {!loading &&
            visible.map(({ tree, nodeCount }) => {
              const checked = selected.has(tree.id);
              return (
                <label
                  key={tree.id}
                  className={`flex cursor-pointer items-center gap-2.5 border-b border-neutral-100 px-3 py-2 last:border-b-0 ${
                    checked ? "bg-neutral-50" : "hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 accent-neutral-800"
                    checked={checked}
                    onChange={() => toggle(tree.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-700">
                    {tree.name}
                    {tree.id === currentTreeId && (
                      <span className="ml-1.5 rounded bg-neutral-200 px-1 py-px text-[9px] text-neutral-600">
                        当前
                      </span>
                    )}
                  </span>
                  {tree.folder ? (
                    <span className="shrink-0 rounded bg-neutral-100 px-1 py-px text-[9px] text-neutral-500">
                      {tree.folder}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[10px] text-neutral-400">
                    {nodeCount} 节点
                  </span>
                  {tree.id !== currentTreeId && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void switchTree(tree.id).then(onClose);
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      title="切换到这棵树"
                    >
                      切换
                    </button>
                  )}
                </label>
              );
            })}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-neutral-400">
            {selected.size > 0
              ? `已选 ${selected.size} 棵树 · ${selectedNodes} 个节点`
              : `共 ${rows.length} 棵树`}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
            >
              关闭
            </button>
            <button
              onClick={() => void handleGroup()}
              disabled={selected.size === 0 || busy}
              className="flex items-center gap-1 rounded-xl border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <FolderPlus size={12} /> 归类…
            </button>
            <button
              onClick={() => void handleUngroup()}
              disabled={
                selected.size === 0 ||
                busy ||
                !selectedRows.some((r) => r.tree.folder)
              }
              className="flex items-center gap-1 rounded-xl border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <FolderMinus size={12} /> 取消分类
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={selected.size === 0 || busy}
              className="flex items-center gap-1 rounded-xl bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <Trash2 size={12} />
              {busy ? "删除中…" : "删除选中"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

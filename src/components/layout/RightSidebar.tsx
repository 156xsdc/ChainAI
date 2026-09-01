/**
 * 右侧便签板：上方目录树 + 下方列表/编辑
 * - 目录树：完整层级展示（缩进），点击目录 = 浏览筛选 / 编辑时移动便签
 * - 编辑时 hover 目录显示 ＋ 可新建子目录（便签自动移入）
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronsRight,
  CornerUpRight,
  Folder,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { confirmDialog, promptDialog } from "../../store/dialogStore";
import {
  deleteNoteFile,
  moveNoteFile,
  readNoteContent,
  writeNoteContent,
} from "../../core/notes/noteService";
import { buildTreeFromPaths, type DirNode } from "../../core/notes/dirTree";
import type { Note } from "../../core/db";

const MIN_W = 220;
const MAX_W = 420;
const COLORS = ["#fafafa", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#f3e8ff"];

export function RightSidebar() {
  const setSidebar = useUIStore((s) => s.setSidebar);
  const repos = useChatStore((s) => s.repos);
  const createBlankNote = useChatStore((s) => s.createBlankNote);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const noteVersion = useChatStore((s) => s.noteVersion);
  const bumpNoteVersion = useChatStore((s) => s.bumpNoteVersion);

  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 浏览态：当前查看目录（"" = 根） */
  const [currentDir, setCurrentDir] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#fafafa");
  const [tagsText, setTagsText] = useState("");
  const [category, setCategory] = useState("");
  /** 颜色筛选（null = 全部） */
  const [filterColor, setFilterColor] = useState<string | null>(null);
  /** 标签搜索关键词 */
  const [tagQuery, setTagQuery] = useState("");
  const [width, setWidth] = useState(280);
  const widthRef = useRef(width);
  const dragRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 恢复保存的宽度
  useEffect(() => {
    if (!repos) return;
    void repos.settings
      .get<number>("layout.rightWidth", 280)
      .then((w) => setWidth(w));
  }, [repos]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  /** 拖拽调整宽度（手柄在左缘，向左拖加宽） */
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX)));
      widthRef.current = next; // 同步 ref，避免 mouseup 时读到滞后值
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      useChatStore
        .getState()
        .repos?.settings.set("layout.rightWidth", widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const loadNotes = async () => {
    if (!repos) return;
    const list = await repos.notes.listAll();
    setNotes(list);
  };

  useEffect(() => {
    void loadNotes();
  }, [repos, noteVersion]);

  // 选中便签 → 加载内容
  /** 选中便签请求序号：防止快速切换时慢的旧请求覆盖新便签内容 */
  const selectSeq = useRef(0);

  const selectNote = async (note: Note) => {
    const seq = ++selectSeq.current;
    setSelectedId(note.id);
    setTitle(note.title);
    setColor(note.color);
    setTagsText(note.tags.join(", "));
    setCategory(note.category);
    setCurrentDir(note.category);
    const content = await readNoteContent(repos!, note);
    // 期间又选了别的便签（seq 变化）→ 丢弃过期结果
    if (seq === selectSeq.current) setContent(content);
  };

  // 持久化目录路径（含根 ""）
  const [dirPaths, setDirPaths] = useState<string[]>([""]);

  const loadDirs = async () => {
    if (!repos) return;
    const dirs = await repos.directories.list();
    setDirPaths(["", ...dirs]);
  };

  useEffect(() => {
    void loadDirs();
  }, [repos, noteVersion]);

  // 目录树（来自持久化目录，空目录也显示）
  const dirTree = useMemo(() => buildTreeFromPaths(dirPaths), [dirPaths]);

  // 便签计数（按分类统计）
  const noteCountByPath = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      const key = n.category || "";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [notes]);

  /** 当前浏览目录下的便签 */
  const dirNotes = useMemo(
    () => notes.filter((n) => (n.category || "") === currentDir),
    [notes, currentDir]
  );

  /** 颜色 + 标签筛选后的便签 */
  const filteredNotes = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return dirNotes.filter((n) => {
      if (filterColor && n.color !== filterColor) return false;
      if (q) {
        const match = n.tags.some((t) => t.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [dirNotes, filterColor, tagQuery]);

  const selected = notes.find((n) => n.id === selectedId);

  /** 移动便签到目录（编辑态） */
  const moveSelectedTo = async (dirPath: string) => {
    const note = notes.find((n) => n.id === selectedId);
    if (!note || !repos) return;
    await moveNoteFile(repos, note, dirPath);
    setCategory(dirPath);
    setCurrentDir(dirPath);
    void loadNotes();
  };

  /** 点击目录：编辑态移动便签 / 浏览态筛选 */
  const onSelectDir = (dirPath: string) => {
    if (selectedId) {
      void moveSelectedTo(dirPath);
    } else {
      setCurrentDir(dirPath);
    }
  };

  /** 新建子目录（任何状态）：持久化目录，编辑时便签移入 */
  const onCreateSubdir = async (parentPath: string) => {
    const name = await promptDialog({
      title: "新建子目录",
      placeholder: "子目录名称",
    });
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const newPath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
    if (!repos) return;
    await repos.directories.ensure(newPath);
    if (selectedId) {
      await moveSelectedTo(newPath);
    } else {
      setCurrentDir(newPath);
    }
    void loadDirs();
    void loadNotes();
  };

  /** 删除目录：其下便签移到根目录，目录记录删除 */
  const onDeleteDir = async (dirPath: string) => {
    if (!repos) return;
    const ok = await confirmDialog({
      title: "删除目录",
      message: `确定删除目录「${dirPath}」？\n其下所有便签将移到「根目录」（便签不会被删除）。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const affected = notes.filter(
      (n) => n.category === dirPath || n.category.startsWith(dirPath + "/")
    );
    for (const n of affected) {
      await moveNoteFile(repos, n, "");
    }
    await repos.directories.remove(dirPath);
    if (currentDir === dirPath || currentDir.startsWith(dirPath + "/")) {
      setCurrentDir("");
    }
    void loadDirs();
    void loadNotes();
  };

  /** 递归渲染目录树 */
  const renderDirTree = (nodes: DirNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const isHighlight =
        selectedId !== null
          ? category === node.path
          : currentDir === node.path;
      return (
        <div key={node.path}>
          <div
            className="group/dir flex items-center"
            style={{ paddingLeft: depth * 14 }}
          >
            <button
              onClick={() => onSelectDir(node.path)}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                isHighlight
                  ? "bg-neutral-100 font-medium text-neutral-800"
                  : "text-neutral-500 hover:bg-neutral-50"
              }`}
              title={`${node.path ? `AITreeNotes/${node.path}` : "AITreeNotes（根目录）"}`}
            >
              <Folder size={11} className="shrink-0 text-neutral-400" />
              <span className="truncate">{node.name}</span>
              <span className="ml-auto shrink-0 text-[9px] text-neutral-400">
                {noteCountByPath.get(node.path) ?? 0}
              </span>
            </button>
            <button
              className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 hover:bg-neutral-100 hover:text-neutral-700 group-hover/dir:opacity-100"
              title="新建子目录"
              onClick={() => void onCreateSubdir(node.path)}
            >
              <Plus size={11} />
            </button>
            <button
              className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover/dir:opacity-100"
              title="删除目录（其下便签移到根目录）"
              onClick={() => void onDeleteDir(node.path)}
            >
              <Trash2 size={10} />
            </button>
          </div>
          {node.children.length > 0 && renderDirTree(node.children, depth + 1)}
        </div>
      );
    });

  // 自动保存（防抖）
  // ⚠️ contentToSave 必须显式传入：setContent 异步，闭包里的 content 是旧值，
  // 直接读闭包会导致最后一次修改（粘贴/末字符）未写入文件
  const scheduleSave = (
    note: Note,
    field: Partial<Pick<Note, "title" | "color" | "tags">> = {},
    contentToSave?: string
  ) => {
    if (!repos) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void repos.notes.update(note.id, field);
      void writeNoteContent(repos, note, contentToSave ?? content);
      void loadNotes();
    }, 600);
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    const note = notes.find((n) => n.id === selectedId);
    if (note) scheduleSave(note, {}, text); // 显式传新内容
  };

  const handleTitleChange = (t: string) => {
    setTitle(t);
    const note = notes.find((n) => n.id === selectedId);
    if (note) scheduleSave(note, { title: t }, content); // content 未变，传当前值
  };

  const handleColorChange = (c: string) => {
    setColor(c);
    const note = notes.find((n) => n.id === selectedId);
    if (note) scheduleSave(note, { color: c }, content);
  };

  const handleTagsChange = (t: string) => {
    setTagsText(t);
    const note = notes.find((n) => n.id === selectedId);
    if (note) {
      scheduleSave(
        note,
        {
          tags: t.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        },
        content
      );
    }
  };

  const handleDelete = async (note?: Note) => {
    if (!repos) return;
    const target = note ?? notes.find((n) => n.id === selectedId);
    if (!target) return;
    const ok = await confirmDialog({
      title: "删除便签",
      message: `确定删除便签「${target.title}」？\n（文件 ${target.filePath}）`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await deleteNoteFile(repos, target);
    if (selectedId === target.id) setSelectedId(null);
    bumpNoteVersion();
    void loadNotes();
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-neutral-200 bg-white"
      style={{ width }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <StickyNote size={12} /> 便签板
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            title="新建便签 (Ctrl+N)"
            onClick={() => void createBlankNote()}
          >
            <Plus size={13} />
          </button>
          <button
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            onClick={() => setSidebar("right", false)}
            title="收起 (Ctrl+Shift+N)"
          >
            <ChevronsRight size={13} />
          </button>
        </div>
      </div>

      {/* 上方：目录树 */}
      <div className="max-h-[42%] shrink-0 overflow-y-auto border-b border-neutral-100 px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] text-neutral-400">
          <Folder size={10} /> 目录结构
          <span className="ml-auto text-[9px] text-neutral-300">
            {selected ? "点击目录 = 移动便签到此" : `${notes.length} 个便签`}
          </span>
        </div>

        <div className="flex flex-col">
          {/* 根目录 */}
          <div className="group/dir flex items-center">
            <button
              onClick={() => onSelectDir("")}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                (selectedId !== null ? category === "" : currentDir === "")
                  ? "bg-neutral-100 font-medium text-neutral-800"
                  : "text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              <Folder size={11} className="shrink-0 text-neutral-400" />
              <span className="truncate">根目录</span>
              <span className="ml-auto shrink-0 text-[9px] text-neutral-400">
                {noteCountByPath.get("") ?? 0}
              </span>
            </button>
            <button
              className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 hover:bg-neutral-100 hover:text-neutral-700 group-hover/dir:opacity-100"
              title="新建子目录"
              onClick={() => void onCreateSubdir("")}
            >
              <Plus size={11} />
            </button>
          </div>

          {/* 子目录树 */}
          {renderDirTree(dirTree, 1)}
        </div>
      </div>

      {/* 下方：列表 / 编辑 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {selected ? (
          /* ===== 编辑视图 ===== */
          <div className="flex h-full flex-col">
            {/* 返回列表 + 标题 */}
            <div className="flex items-center gap-1.5 pb-2">
              <button
                className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft size={12} /> 返回
              </button>
              <input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-800 outline-none hover:bg-neutral-50 focus:bg-neutral-50"
                placeholder="便签标题"
              />
              <button
                className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                title="关联节点跳转"
                disabled={!selected.nodeId}
                onClick={() => selected.nodeId && navigateTo(selected.nodeId)}
              >
                <CornerUpRight size={13} />
              </button>
              <button
                className="shrink-0 rounded-md p-1 text-neutral-300 hover:bg-neutral-100 hover:text-red-500"
                title="删除便签"
                onClick={() => void handleDelete()}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* 位置（在目录树中选择） */}
            <div className="flex items-center gap-1.5 pb-1">
              <Folder size={11} className="shrink-0 text-neutral-300" />
              <span
                className="min-w-0 flex-1 truncate text-[10px] text-neutral-500"
                title={category}
              >
                位置：AITreeNotes{category ? `/${category}` : ""}
              </span>
            </div>
            <div className="pb-2 text-[9px] leading-relaxed text-neutral-300">
              在上方目录树点击目录即可移动；悬停目录的 ＋ 可新建子目录
            </div>

            {/* 颜色 + 标签 */}
            <div className="flex items-center gap-1.5 pb-1.5">
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-4 w-4 rounded-full border transition-transform ${
                      color === c ? "scale-110 border-neutral-600" : "border-neutral-200"
                    }`}
                    style={{ background: c }}
                    onClick={() => handleColorChange(c)}
                  />
                ))}
              </div>
              <input
                value={tagsText}
                onChange={(e) => handleTagsChange(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-neutral-100 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500 outline-none focus:border-neutral-300"
                placeholder="标签（逗号分隔）"
              />
            </div>

            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="min-h-0 flex-1 resize-none bg-transparent px-1 py-1 font-mono text-[12px] leading-relaxed text-neutral-700 outline-none"
              placeholder="支持 Markdown 格式..."
              spellCheck={false}
            />
            <div className="px-1 py-1 text-[9px] text-neutral-300">
              {selected.filePath}
            </div>
          </div>
        ) : (
          /* ===== 列表（当前目录 + 筛选） ===== */
          <>
            {/* 筛选工具栏：颜色 + 标签 */}
            <div className="mb-2 flex flex-col gap-1.5 rounded-xl border border-neutral-100 bg-neutral-50/50 px-2 py-1.5">
              {/* 颜色筛选 */}
              <div className="flex items-center gap-1">
                <button
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${
                    filterColor === null
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:bg-neutral-100"
                  }`}
                  onClick={() => setFilterColor(null)}
                >
                  全部
                </button>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-4 w-4 rounded-full border transition-transform ${
                      filterColor === c
                        ? "scale-110 border-neutral-700 ring-1 ring-neutral-700 ring-offset-1"
                        : "border-neutral-200 hover:scale-105"
                    }`}
                    style={{ background: c }}
                    title="按颜色筛选"
                    onClick={() => setFilterColor(filterColor === c ? null : c)}
                  />
                ))}
                {filterColor && (
                  <button
                    className="ml-auto shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    title="清除筛选"
                    onClick={() => setFilterColor(null)}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              {/* 标签搜索 */}
              <div className="flex items-center gap-1">
                <Search size={11} className="shrink-0 text-neutral-300" />
                <input
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder="按标签搜索..."
                  className="min-w-0 flex-1 bg-transparent text-[10px] text-neutral-600 outline-none placeholder:text-neutral-300"
                />
                {tagQuery && (
                  <button
                    className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    title="清除"
                    onClick={() => setTagQuery("")}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>

            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <StickyNote size={26} strokeWidth={1} className="text-neutral-200" />
                <div className="text-xs text-neutral-300">
                  {dirNotes.length === 0
                    ? notes.length === 0
                      ? "暂无便签"
                      : "此目录暂无便签"
                    : "没有符合筛选的便签"}
                  <br />
                  {notes.length === 0 && "（右键消息或 ➕ 可创建）"}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredNotes.map((n) => (
                  <div key={n.id} className="group/note relative">
                    <button
                      onClick={() => void selectNote(n)}
                      className="flex w-full items-start gap-2 rounded-xl border border-neutral-200 px-2.5 py-2 text-left hover:border-neutral-300 hover:shadow-sm"
                      style={{ background: n.color }}
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#b0b0b0" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-neutral-800">
                          {n.title || "未命名便签"}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-neutral-400">
                          {n.tags.length > 0 ? `#${n.tags.join(" #")}` : new Date(n.updatedAt).toLocaleString()}
                        </span>
                      </span>
                      {n.nodeId && (
                        <span
                          className="shrink-0 rounded bg-neutral-200/60 px-1 text-[9px] text-neutral-500"
                          title="已关联对话节点"
                        >
                          节点
                        </span>
                      )}
                    </button>
                    <button
                      className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-md bg-white/90 text-neutral-400 shadow-sm hover:bg-red-50 hover:text-red-500 group-hover/note:flex"
                      title="删除便签"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(n);
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 拖拽调整宽度手柄 */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-neutral-300/70 active:bg-neutral-400"
        onMouseDown={startDrag}
        title="拖拽调整宽度"
      />
    </aside>
  );
}

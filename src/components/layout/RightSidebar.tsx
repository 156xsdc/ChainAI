/**
 * 右侧便签板：上方目录结构 + 下方便签列表/编辑
 * - 目录树：根目录 + 分类子目录（点击筛选）
 * - 点击便签进入编辑，可返回列表
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronsRight,
  CornerUpRight,
  Folder,
  FolderTree,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { confirmDialog } from "../../store/dialogStore";
import {
  deleteNoteFile,
  moveNoteFile,
  readNoteContent,
  writeNoteContent,
} from "../../core/notes/noteService";
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
  /** 文件浏览器导航路径（[] = 根目录，["项目A"] = AITreeNotes/项目A） */
  const [path, setPath] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#fafafa");
  const [tagsText, setTagsText] = useState("");
  const [category, setCategory] = useState("");
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
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX))));
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
  const selectNote = async (note: Note) => {
    setSelectedId(note.id);
    setTitle(note.title);
    setColor(note.color);
    setTagsText(note.tags.join(", "));
    setCategory(note.category);
    setContent(await readNoteContent(repos!, note));
  };

  // 当前导航路径字符串（"" = 根目录）
  const currentPath = path.join("/");

  // 当前目录的直接子目录（支持多级导航）
  const subDirs = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      const parts = (n.category || "").split(/[\\/]/).filter(Boolean);
      if (parts.length <= path.length) continue;
      if (path.length === 0 || n.category.startsWith(currentPath + "/")) {
        set.add(parts[path.length]);
      }
    }
    return [...set].sort();
  }, [notes, path, currentPath]);

  // 当前目录下的便签
  const dirNotes = useMemo(
    () => notes.filter((n) => (n.category || "") === currentPath),
    [notes, currentPath]
  );

  // 返回上级目录
  const goUp = () => setPath((p) => p.slice(0, -1));

  /** 便签移动到当前导航目录 */
  const handleMoveToCurrent = async () => {
    const note = notes.find((n) => n.id === selectedId);
    if (!note || !repos) return;
    await moveNoteFile(repos, note, currentPath);
    setCategory(currentPath);
    void loadNotes();
  };

  // 自动保存（防抖）
  const scheduleSave = (note: Note, field: Partial<Pick<Note, "title" | "color" | "tags">> = {}) => {
    if (!repos) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void repos.notes.update(note.id, field);
      void writeNoteContent(repos, note, content);
      void loadNotes();
    }, 600);
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    const note = notes.find((n) => n.id === selectedId);
    if (note) scheduleSave(note);
  };

  const handleTitleChange = (t: string) => {
    setTitle(t);
    const note = notes.find((n) => n.id === selectedId);
    if (note) scheduleSave(note, { title: t });
  };

  const handleColorChange = (c: string) => {
    setColor(c);
    const note = notes.find((n) => n.id === selectedId);
    if (note) scheduleSave(note, { color: c });
  };

  const handleTagsChange = (t: string) => {
    setTagsText(t);
    const note = notes.find((n) => n.id === selectedId);
    if (note) {
      scheduleSave(note, {
        tags: t.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      });
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

  const selected = notes.find((n) => n.id === selectedId);

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

      {/* 上方：文件浏览器（多级导航 + 返回上级） */}
      <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-neutral-100 px-3 py-2.5">
        <div className="mb-1 flex items-center gap-1 text-[10px] text-neutral-400">
          <FolderTree size={10} /> 目录结构
          <span className="ml-auto text-[9px] text-neutral-300">
            {selected ? "选择便签位置" : `${dirNotes.length} 个便签`}
          </span>
        </div>

        {/* 面包屑 + 返回上级 */}
        <div className="mb-1.5 flex items-center gap-1 overflow-x-auto text-[10px] whitespace-nowrap">
          <button
            className={`shrink-0 rounded px-1 py-0.5 hover:bg-neutral-100 ${
              path.length === 0 ? "font-medium text-neutral-700" : "text-neutral-400 hover:text-neutral-600"
            }`}
            onClick={() => setPath([])}
          >
            AITreeNotes
          </button>
          {path.map((seg, i) => (
            <span key={i} className="flex shrink-0 items-center gap-1">
              <span className="text-neutral-300">/</span>
              <button
                className={`rounded px-1 py-0.5 hover:bg-neutral-100 ${
                  i === path.length - 1
                    ? "font-medium text-neutral-700"
                    : "text-neutral-400 hover:text-neutral-600"
                }`}
                onClick={() => setPath(path.slice(0, i + 1))}
              >
                {seg}
              </button>
            </span>
          ))}
          {path.length > 0 && (
            <button
              className="ml-1 shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              onClick={goUp}
              title="返回上级目录"
            >
              ↑ 上级
            </button>
          )}
        </div>

        {/* 当前目录内容 */}
        <div className="flex flex-col gap-0.5">
          {/* 子目录 */}
          {subDirs.map((d) => (
            <button
              key={d}
              onClick={() => setPath([...path, d])}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-neutral-600 hover:bg-neutral-100"
              title={`进入 ${d}/`}
            >
              <Folder size={11} className="shrink-0 text-neutral-400" />
              <span className="truncate">{d}/</span>
            </button>
          ))}

          {/* 当前目录便签 */}
          {dirNotes.map((n) => (
            <button
              key={n.id}
              onClick={() => void selectNote(n)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] hover:bg-neutral-100 ${
                selectedId === n.id ? "bg-neutral-100 text-neutral-800" : "text-neutral-500"
              }`}
              title={n.title}
            >
              <StickyNote size={10} className="shrink-0 text-neutral-300" />
              <span className="truncate">{n.title || "未命名便签"}</span>
            </button>
          ))}

          {subDirs.length === 0 && dirNotes.length === 0 && (
            <div className="px-2 py-2 text-[10px] text-neutral-300">
              空目录{selected ? "（点下方「移到此处」可把便签放这里）" : ""}
            </div>
          )}
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

            {/* 目录位置：在上方目录浏览器中选择 */}
            <div className="flex items-center gap-1.5 pb-2">
              <Folder size={11} className="shrink-0 text-neutral-300" />
              <div className="min-w-0 flex-1 truncate text-[10px] text-neutral-500" title={currentPath}>
                位置：AITreeNotes{currentPath ? `/${currentPath}` : ""}
              </div>
              <button
                className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                disabled={category === currentPath}
                onClick={() => void handleMoveToCurrent()}
                title="在上方目录中导航，然后点此按钮移动便签"
              >
                移到此处
              </button>
            </div>
            <div className="-mt-1 pb-1.5 text-[9px] text-neutral-300">
              在上方目录结构中导航到目标目录，点「移到此处」更换位置
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
          /* ===== 列表（当前目录） ===== */
          <>
            {dirNotes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <StickyNote size={26} strokeWidth={1} className="text-neutral-200" />
                <div className="text-xs text-neutral-300">
                  {notes.length === 0 ? "暂无便签" : "此目录暂无便签"}
                  <br />
                  {notes.length === 0 && "（右键消息或 ➕ 可创建）"}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {dirNotes.map((n) => (
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

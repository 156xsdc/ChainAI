/**
 * 右侧便签板：Markdown 便签的列表 / 编辑 / 自动保存
 * 内容存独立 .md 文件，元数据存 SQLite
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsRight, CornerUpRight, Folder, Plus, StickyNote, Trash2 } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";

const MIN_W = 220;
const MAX_W = 420;
import {
  deleteNoteFile,
  moveNoteFile,
  readNoteContent,
  writeNoteContent,
} from "../../core/notes/noteService";
import type { Note } from "../../core/db";

const COLORS = ["#fafafa", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#f3e8ff"];

export function RightSidebar() {
  const setSidebar = useUIStore((s) => s.setSidebar);
  const repos = useChatStore((s) => s.repos);
  const createBlankNote = useChatStore((s) => s.createBlankNote);
  const navigateTo = useChatStore((s) => s.navigateTo);

  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  }, [repos]);

  // 选中便签 → 加载内容
  const selectNote = async (note: Note) => {
    setSelectedId(note.id);
    setTitle(note.title);
    setColor(note.color);
    setTagsText(note.tags.join(", "));
    setCategory(note.category);
    setContent(await readNoteContent(repos!, note));
  };

  // 按分类子目录分组（目录结构显示）
  const groups = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const key = n.category || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return [...map.entries()]
      .map(([cat, items]) => ({ category: cat, items }))
      .sort((a, b) =>
        a.category === "" ? 1 : b.category === "" ? -1 : a.category.localeCompare(b.category)
      );
  }, [notes]);

  /** 分类变更：移动文件 + 更新记录 */
  const handleCategoryChange = async (v: string) => {
    setCategory(v);
    const note = notes.find((n) => n.id === selectedId);
    if (!note || !repos) return;
    await moveNoteFile(repos, note, v);
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

  const handleDelete = async () => {
    if (!repos || !selectedId) return;
    const note = notes.find((n) => n.id === selectedId);
    if (!note) return;
    if (!window.confirm(`删除便签「${note.title}」？（文件 ${note.filePath}）`)) return;
    await deleteNoteFile(repos, note);
    setSelectedId(null);
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

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {notes.length === 0 && !selected && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <StickyNote size={26} strokeWidth={1} className="text-neutral-200" />
            <div className="text-xs text-neutral-300">
              暂无便签
              <br />
              （右键消息可快速创建）
            </div>
          </div>
        )}

        {!selected &&
          groups.map(({ category: cat, items }) => (
            <div key={cat || "__root__"} className="mb-2">
              {/* 目录分组头（文件结构） */}
              <div className="flex items-center gap-1 px-1.5 pb-1 pt-0.5 text-[10px] text-neutral-400">
                <Folder size={9} />
                {cat ? `AITreeNotes/${cat}` : "AITreeNotes（根目录）"}
                <span className="text-neutral-300">({items.length})</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((n) => (
                  <button
                    key={n.id}
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
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* 编辑视图 */}
      {selected && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-neutral-100">
          <div className="flex items-center gap-1.5 px-3 pt-2">
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
          <div className="flex items-center gap-1.5 px-3 py-1.5">
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

          {/* 分类子目录（移动文件到子目录） */}
          <div className="flex items-center gap-1.5 px-3 pb-1.5">
            <Folder size={11} className="shrink-0 text-neutral-300" />
            <input
              value={category}
              onChange={(e) => void handleCategoryChange(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-neutral-100 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500 outline-none focus:border-neutral-300"
              placeholder="分类子目录（如：项目A，留空=根目录）"
            />
          </div>

          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[12px] leading-relaxed text-neutral-700 outline-none"
            placeholder="支持 Markdown 格式..."
            spellCheck={false}
          />
          <div className="px-3 py-1 text-[9px] text-neutral-300">
            {selected.filePath}
          </div>
        </div>
      )}

      {/* 拖拽调整宽度手柄 */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-neutral-300/70 active:bg-neutral-400"
        onMouseDown={startDrag}
        title="拖拽调整宽度"
      />
    </aside>
  );
}

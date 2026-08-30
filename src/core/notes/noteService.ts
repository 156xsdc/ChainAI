/**
 * 便签服务：内容存 Markdown 文件，元数据存 SQLite
 * 存储位置：用户可自定义（settings('notes.storageDir')），默认 ~/Documents/AITreeNotes/
 */
import { invoke } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import { newId } from "../db/util";
import type { AppRepositories, Note } from "../db";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface CreateNoteInput {
  title: string;
  content?: string;
  /** 分类子目录名（空 = 根目录） */
  category?: string;
  color?: string;
  nodeId?: string | null;
  tags?: string[];
}

/** 提取文件名（含扩展名） */
function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** 生成分类下的文件路径（支持多级：category = "项目A/子项目"） */
export async function noteFilePath(
  repos: AppRepositories,
  category: string | undefined,
  fileName: string
): Promise<string> {
  const dir = await getNotesDir(repos);
  const segs = (category ?? "")
    .split(/[\\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segs.length > 0 ? join(dir, ...segs, fileName) : join(dir, fileName);
}

/** 便签存储目录（自定义或默认文档目录/AITreeNotes） */
export async function getNotesDir(repos: AppRepositories): Promise<string> {
  const custom = await repos.settings.get<string | null>("notes.storageDir", null);
  if (custom && custom.trim()) return custom.trim();
  const doc = await documentDir();
  return join(doc, "AITreeNotes");
}

/** 创建便签：写 md 文件 + 数据库记录 */
export async function createNoteFile(
  repos: AppRepositories,
  input: CreateNoteInput
): Promise<Note | null> {
  if (!inTauri) return null;
  const filePath = await noteFilePath(repos, input.category, `${newId()}.md`);
  const note = await repos.notes.create({
    title: input.title || "未命名便签",
    filePath,
    category: input.category,
    color: input.color ?? "#fafafa",
    nodeId: input.nodeId ?? null,
    tags: input.tags ?? [],
  });
  await invoke("write_text_file", { path: note.filePath, content: input.content ?? "" });
  return note;
}

/**
 * 移动便签到新的分类子目录（或根目录）
 * 旧文件 → 新路径写入 → 删除旧文件 → 更新记录
 */
export async function moveNoteFile(
  repos: AppRepositories,
  note: Note,
  newCategory: string
): Promise<Note | null> {
  const cat = newCategory.trim();
  if (cat === note.category) return note;
  if (!inTauri) {
    return repos.notes.update(note.id, { category: cat });
  }
  const newPath = await noteFilePath(repos, cat, basename(note.filePath));
  const content = await readNoteContent(repos, note);
  await invoke("write_text_file", { path: newPath, content });
  await invoke("delete_file", { path: note.filePath }).catch(() => {});
  return repos.notes.update(note.id, { category: cat, filePath: newPath });
}

/** 写入便签内容 */
export async function writeNoteContent(
  _repos: AppRepositories,
  note: Note,
  content: string
): Promise<void> {
  if (!inTauri) return;
  await invoke("write_text_file", { path: note.filePath, content });
}

/** 读取便签内容 */
export async function readNoteContent(
  _repos: AppRepositories,
  note: Note
): Promise<string> {
  if (!inTauri) return "";
  try {
    return await invoke<string>("read_text_file", { path: note.filePath });
  } catch {
    return "";
  }
}

/** 删除便签：删文件 + 删数据库记录 */
export async function deleteNoteFile(
  repos: AppRepositories,
  note: Note
): Promise<void> {
  if (inTauri) {
    await invoke("delete_file", { path: note.filePath }).catch(() => {});
  }
  await repos.notes.delete(note.id);
}

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
  color?: string;
  nodeId?: string | null;
  tags?: string[];
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
  const dir = await getNotesDir(repos);
  const note = await repos.notes.create({
    title: input.title || "未命名便签",
    filePath: await join(dir, `${newId()}.md`),
    color: input.color ?? "#fafafa",
    nodeId: input.nodeId ?? null,
    tags: input.tags ?? [],
  });
  await invoke("write_text_file", { path: note.filePath, content: input.content ?? "" });
  return note;
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

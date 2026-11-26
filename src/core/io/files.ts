/**
 * 文件读写封装：Tauri 对话框 + Rust 命令
 * 非 Tauri 环境（浏览器调试）下返回 null
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 保存 JSON 文件，返回保存路径（取消返回 null） */
export async function saveJsonFile(
  defaultName: string,
  content: string
): Promise<string | null> {
  if (!inTauri) return null;
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "JSON 备份", extensions: ["json"] }],
  });
  if (!path) return null;
  await invoke("write_text_file", { path, content });
  return path as string;
}

/** 打开 JSON 文件，返回 { 路径, 内容 }（取消返回 null） */
export async function openJsonFile(): Promise<{
  path: string;
  content: string;
} | null> {
  return openTextFile([{ name: "JSON 备份", extensions: ["json"] }]);
}

/** 保存文本文件（通用） */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filters: { name: string; extensions: string[] }[]
): Promise<string | null> {
  if (!inTauri) return null;
  const path = await save({ defaultPath: defaultName, filters });
  if (!path) return null;
  await invoke("write_text_file", { path, content });
  return path as string;
}

/** 打开文本文件（通用） */
export async function openTextFile(filters: {
  name: string;
  extensions: string[];
}[]): Promise<{ path: string; content: string } | null> {
  if (!inTauri) return null;
  const path = await open({ multiple: false, directory: false, filters });
  if (!path || Array.isArray(path)) return null;
  const content = await invoke<string>("read_text_file", { path });
  return { path: path as string, content };
}

/** 选择目录（返回路径，取消返回 null） */
export async function chooseDirectory(): Promise<string | null> {
  if (!inTauri) return null;
  const path = await open({ directory: true, multiple: false });
  if (!path || Array.isArray(path)) return null;
  return path as string;
}

/** 目录项 */
export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

/** 列出目录内容（批量导入用；非 Tauri 环境返回空数组） */
export async function listDir(path: string): Promise<DirEntry[]> {
  if (!inTauri) return [];
  try {
    return await invoke<DirEntry[]>("list_dir", { path });
  } catch {
    return [];
  }
}

/** 选择 PDF 文件（返回路径，取消返回 null） */
export async function choosePdfFile(): Promise<string | null> {
  if (!inTauri) return null;
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path || Array.isArray(path)) return null;
  return path as string;
}

/** 读取任意二进制文件为 base64（PDF 解析用） */
export async function readFileBase64(path: string): Promise<string> {
  return await invoke<string>("read_file_base64", { path });
}

/** 保存 PNG 文件（base64 内容） */
export async function savePngFile(
  defaultName: string,
  base64Content: string
): Promise<string | null> {
  if (!inTauri) return null;
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
  if (!path) return null;
  await invoke("write_binary_file", { path, base64Content });
  return path as string;
}

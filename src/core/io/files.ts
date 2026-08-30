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
  if (!inTauri) return null;
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "JSON 备份", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return null;
  const content = await invoke<string>("read_text_file", { path });
  return { path: path as string, content };
}

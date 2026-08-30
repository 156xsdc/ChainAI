/**
 * 应用数据路径（数据随程序走）
 *
 * 约定：
 * - 安装版（release）：数据目录 = 可执行文件所在目录（安装路径）
 * - 开发版（debug）：数据目录 = 系统应用数据目录（AppData，避免 cargo clean 误删）
 * - 浏览器调试：返回 null（无法获取，调用方降级处理）
 */
import { invoke } from "@tauri-apps/api/core";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 应用数据目录（安装版=exe目录；开发版=AppData；浏览器=null） */
export async function getAppDataDir(): Promise<string | null> {
  if (!inTauri) return null;
  try {
    return await invoke<string>("app_data_dir");
  } catch {
    return null;
  }
}

/** 拼接路径（Windows 风格，去重分隔符） */
export function joinPath(...segs: Array<string | null | undefined>): string {
  return segs
    .filter((s) => s && s.trim())
    .join("\\")
    .replace(/[\\/]+/g, "\\");
}

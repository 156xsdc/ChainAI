/**
 * 应用数据路径（数据随程序走 / 平台差异）
 *
 * 约定：
 * - Windows 安装版（release）：数据目录 = 可执行文件所在目录（安装路径，可写）
 * - macOS / Linux：数据目录 = 系统应用数据目录
 *   （macOS 的 .app 包内是签名只读区，升级/重装会整包替换，绝不能把数据放里面）
 * - 开发版（debug）：系统应用数据目录（避免 cargo clean 误删）
 * - 浏览器调试：返回 null（调用方降级处理）
 */
import { invoke } from "@tauri-apps/api/core";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 应用数据目录（Windows 安装版=exe目录；其他=系统应用数据目录；浏览器=null） */
export async function getAppDataDir(): Promise<string | null> {
  if (!inTauri) return null;
  try {
    return await invoke<string>("app_data_dir");
  } catch {
    return null;
  }
}

/** 当前平台是否为 Windows（决定路径分隔符） */
function detectWindows(): boolean {
  if (typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)) {
    return true;
  }
  if (typeof process !== "undefined" && typeof process.platform === "string") {
    return process.platform === "win32";
  }
  return false;
}

export const IS_WINDOWS = detectWindows();
/** 当前平台路径分隔符 */
export const PATH_SEP: "\\" | "/" = IS_WINDOWS ? "\\" : "/";

/**
 * 拼接路径（按平台分隔符，去重分隔符，过滤空段）
 *
 * ⚠️ 早期实现在所有平台都用 `\` 拼接，导致 macOS 上
 * `/Applications/x` 被拼成 `\Applications\x`（相对路径），数据库/便签/备份
 * 全部散落到名字带反斜杠的文件里。这里改为平台感知。
 */
export function joinPath(...segs: Array<string | null | undefined>): string {
  return joinPathWith(PATH_SEP, ...segs);
}

/** 指定分隔符拼接（导出便于测试） */
export function joinPathWith(
  sep: "\\" | "/",
  ...segs: Array<string | null | undefined>
): string {
  const parts = segs
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim());
  if (parts.length === 0) return "";

  // 混合分隔符统一成目标分隔符
  const collapse = (s: string) => s.replace(/[\\/]+/g, sep);
  // 去掉尾部分隔符（根路径 "/" 保留）
  const trimEnd = (s: string) => {
    let r = s;
    while (r.length > sep.length && r.endsWith(sep)) r = r.slice(0, -sep.length);
    return r;
  };
  // 去掉首部分隔符（绝对路径的前缀由首段自带）
  const trimStart = (s: string) => {
    let r = s;
    while (r.length > 1 && r.startsWith(sep)) r = r.slice(1);
    return r;
  };

  const [head, ...rest] = parts;
  const normalizedHead = trimEnd(collapse(head));
  const tails = rest
    .map((p) => trimStart(trimEnd(collapse(p))))
    .filter((p) => p !== "" && p !== sep);

  // 逐段拼接：首段保留自己的前缀（含根路径 "/"），避免出现 "//" 或 "C:\\C:"
  let out = normalizedHead;
  for (const t of tails) {
    if (out === "") {
      out = t;
    } else {
      out = out.endsWith(sep) ? `${out}${t}` : `${out}${sep}${t}`;
    }
  }
  return out;
}

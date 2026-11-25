/**
 * 更新检查的运行时封装：版本号获取 + 结果缓存 + 并发去重
 * （不依赖 store，UI 层自己决定怎么提示）
 */
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate, type UpdateCheckResult } from "./release";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 最近一次检查结果（设置面板打开时直接复用，不再打一次网络） */
let lastResult: UpdateCheckResult | null = null;
let inflight: Promise<UpdateCheckResult | null> | null = null;

export function getLastUpdateResult(): UpdateCheckResult | null {
  return lastResult;
}

/** 当前应用版本（来自 Tauri，与 Cargo/tauri.conf 的 version 一致） */
export async function getAppVersion(): Promise<string> {
  if (!inTauri) return "0.0.0";
  try {
    return await getVersion();
  } catch {
    return "0.0.0";
  }
}

/** 检查更新（并发调用共享同一个请求） */
export async function runUpdateCheck(): Promise<UpdateCheckResult | null> {
  if (!inTauri) return null;
  if (inflight) return inflight;
  inflight = (async () => {
    const current = await getAppVersion();
    const result = await checkForUpdate(current);
    lastResult = result;
    return result;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

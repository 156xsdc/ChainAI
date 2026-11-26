/**
 * 更新检查（轻量版：检查 + 引导下载，不做自动安装）
 *
 * 数据源：GitHub Releases「latest」接口
 *   https://api.github.com/repos/<owner>/<repo>/releases/latest
 * - 只返回正式版（draft / prerelease 自动排除）
 * - 支持 CORS，因此前端直接 fetch 即可，不需要额外 Rust 依赖或代理
 * - 未登录限流 60 次/小时/IP，对"启动查一次"完全够用
 *
 * 不做的部分：下载后自动替换 .app。那需要 minisign 密钥对 + 更新服务器 +
 * tauri-plugin-updater，留到有正式发布流水线时再上。
 */

/** 发布仓库 */
export const UPDATE_REPO = "156xsdc/ChainAI";

/** 列表接口：用于跳过"没有本平台安装包"的版本（Windows / macOS 版本线可能不同步） */
const LIST_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`;
const RELEASES_PAGE = `https://github.com/${UPDATE_REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateRelease {
  /** 版本号（已去掉 v 前缀），如 0.0.13 */
  version: string;
  /** 发布标题（通常和版本号一致） */
  title: string;
  /** 发布说明（Markdown 原文） */
  notes: string;
  /** 发布页地址 */
  pageUrl: string;
  /** 当前平台安装包直链；找不到就回落到发布页 */
  downloadUrl: string;
  /** 本次发布是否包含当前平台的安装包 */
  hasPlatformAsset: boolean;
  publishedAt: string;
}

export interface UpdateCheckResult {
  /** 当前应用版本 */
  current: string;
  /** 远端最新版本；请求失败时为 null */
  latest: UpdateRelease | null;
  /** 是否有更新 */
  hasUpdate: boolean;
  /** 失败原因（网络 / 无发布 / 限流等），成功时不返回 */
  error?: string;
}

/** 版本号解析：容忍 v 前缀、预发布后缀（1.2.3-beta.1 → [1,2,3]） */
export function parseVersion(version: string): number[] {
  const core = version.trim().replace(/^v/i, "").split(/[-+]/)[0];
  return core.split(".").map((p) => Number.parseInt(p, 10) || 0);
}

/** 语义版本比较：返回 1 表示 a 更新，-1 表示 b 更新，0 相同 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export type ReleasePlatform = "macos" | "windows" | "linux";

/** 当前平台（按 WebView UA 判断，足够区分安装包格式） */
export function detectPlatform(): ReleasePlatform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  return "linux";
}

/**
 * 从发布附件里挑当前平台的安装包：
 * - macOS：arm64/aarch64 的 dmg → universal → 任意 dmg
 * - Windows：*setup.exe（NSIS）→ *.msi
 * - Linux：*.AppImage → *.deb
 * 找不到返回 null（调用方回落到发布页）
 */
export function pickAsset(
  assets: ReleaseAsset[],
  platform: ReleasePlatform = "macos"
): string | null {
  const named = (pattern: RegExp) =>
    assets.find((a) => pattern.test(a.name.toLowerCase()))?.url ?? null;

  if (platform === "macos") {
    return (
      named(/aarch64.*\.dmg$|arm64.*\.dmg$/) ??
      named(/universal.*\.dmg$/) ??
      named(/\.dmg$/)
    );
  }
  if (platform === "windows") {
    return named(/setup\.exe$/) ?? named(/\.msi$/) ?? named(/\.exe$/);
  }
  return named(/\.appimage$/) ?? named(/\.deb$/);
}

/** 发布说明压缩成一行预览（设置里展示用，避免超长正文撑爆弹窗） */
export function summarizeNotes(notes: string, max = 400): string {
  const flat = notes.replace(/\r/g, "").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** GitHub release JSON → 统一结构（导出便于测试） */
export function normalizeRelease(
  json: unknown,
  platform: ReleasePlatform = "macos"
): UpdateRelease {
  const data = (json ?? {}) as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
  };
  const assets: ReleaseAsset[] = (data.assets ?? [])
    .filter((a) => typeof a.browser_download_url === "string")
    .map((a) => ({
      name: a.name ?? "",
      url: a.browser_download_url as string,
      size: a.size ?? 0,
    }));
  const tag = (data.tag_name ?? "").trim();
  const assetUrl = pickAsset(assets, platform);
  return {
    version: tag.replace(/^v/i, "") || "0.0.0",
    title: (data.name ?? tag) || "未命名版本",
    notes: (data.body ?? "").trim(),
    pageUrl: data.html_url || RELEASES_PAGE,
    downloadUrl: assetUrl ?? data.html_url ?? RELEASES_PAGE,
    hasPlatformAsset: assetUrl !== null,
    publishedAt: data.published_at ?? "",
  };
}

/**
 * 从版本列表里挑「适用本平台」的最新版（列表按发布时间倒序）
 *
 * 背景：Windows 与 macOS 版本线可能不同步。若只看 /releases/latest，
 * 遇到"最新版只发了 Windows 包"就会误报有新版本，用户点进去却下不到东西。
 * 因此优先挑**带本平台安装包**的最新版；一个都没有时返回 null。
 */
export function pickApplicableRelease(
  releases: UpdateRelease[]
): UpdateRelease | null {
  return releases.find((r) => r.hasPlatformAsset) ?? null;
}

/** 检查更新（网络失败不抛异常，统一返回 error 字段） */
export async function checkForUpdate(
  currentVersion: string,
  platform: ReleasePlatform = detectPlatform()
): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = {
    current: currentVersion,
    latest: null,
    hasUpdate: false,
  };
  try {
    const res = await fetch(LIST_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.status === 404) {
      return { ...base, error: "还没有发布过版本" };
    }
    if (res.status === 403) {
      return { ...base, error: "GitHub 接口限流，稍后再试" };
    }
    if (!res.ok) {
      return { ...base, error: `GitHub 返回 ${res.status}` };
    }
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) {
      return { ...base, error: "GitHub 返回格式异常" };
    }
    const releases = json.map((r) => normalizeRelease(r, platform));
    if (releases.length === 0) {
      return { ...base, error: "还没有发布过版本" };
    }

    const latestAny = releases[0];
    const applicable = pickApplicableRelease(releases);
    if (!applicable) {
      // 最新几个版本都没有本平台安装包（例如只发了 Windows 包）
      const newer = compareVersions(latestAny.version, currentVersion) > 0;
      return {
        ...base,
        latest: latestAny,
        error: newer
          ? `${latestAny.version} 暂无本平台安装包，可在发布页查看`
          : undefined,
      };
    }
    return {
      ...base,
      latest: applicable,
      hasUpdate: compareVersions(applicable.version, currentVersion) > 0,
    };
  } catch {
    return { ...base, error: "无法连接 GitHub（检查网络）" };
  }
}

/** 发布页地址（"打开发布页"按钮用） */
export const RELEASE_PAGE_URL = RELEASES_PAGE;

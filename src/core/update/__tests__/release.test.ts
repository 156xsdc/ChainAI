import { describe, it, expect } from "vitest";
import {
  compareVersions,
  normalizeRelease,
  parseVersion,
  pickApplicableRelease,
  pickAsset,
  summarizeNotes,
  type ReleaseAsset,
  type UpdateRelease,
} from "../release";

const rel = (
  version: string,
  hasPlatformAsset: boolean
): UpdateRelease => ({
  version,
  title: version,
  notes: "",
  pageUrl: "https://github.com/156xsdc/ChainAI/releases",
  downloadUrl: "https://github.com/156xsdc/ChainAI/releases",
  hasPlatformAsset,
  publishedAt: "",
});

const asset = (name: string, url = `https://x/${name}`): ReleaseAsset => ({
  name,
  url,
  size: 1000,
});

describe("版本号解析与比较", () => {
  it("容错 v 前缀与预发布后缀", () => {
    expect(parseVersion("v0.0.13")).toEqual([0, 0, 13]);
    expect(parseVersion("1.2.3-beta.1")).toEqual([1, 2, 3]);
    expect(parseVersion("2")).toEqual([2]);
  });

  it("逐段比较，位长不同按 0 补齐", () => {
    expect(compareVersions("0.0.13", "0.0.12")).toBe(1);
    expect(compareVersions("0.0.12", "0.0.13")).toBe(-1);
    expect(compareVersions("0.1", "0.1.0")).toBe(0);
    expect(compareVersions("v1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1); // 不能按字符串比
  });
});

describe("pickAsset（按平台挑安装包）", () => {
  it("macOS：优先 Apple Silicon 包", () => {
    const url = pickAsset(
      [
        asset("tongtu_0.0.13_x64.dmg"),
        asset("tongtu_0.0.13_aarch64.dmg"),
      ],
      "macos"
    );
    expect(url).toContain("aarch64");
  });

  it("macOS：没有 arm 包时退回 universal，再退回任意 dmg", () => {
    expect(
      pickAsset([asset("app_x64.dmg"), asset("app_universal.dmg")], "macos")
    ).toContain("universal");
    expect(
      pickAsset([asset("only.dmg"), asset("readme.txt")], "macos")
    ).toContain("only.dmg");
  });

  it("macOS：只有 Windows 包时返回 null（不能乱下）", () => {
    expect(pickAsset([asset("tongtu_0.0.16_x64-setup.exe")], "macos")).toBeNull();
  });

  it("Windows：优先 setup.exe", () => {
    expect(
      pickAsset(
        [asset("tongtu_0.0.16_x64-setup.exe"), asset("other.msi")],
        "windows"
      )
    ).toContain("setup.exe");
  });
});

describe("normalizeRelease", () => {
  const json = {
    tag_name: "v0.0.13",
    name: "通途 0.0.13",
    body: "## 修复\n- 路径问题",
    html_url: "https://github.com/156xsdc/ChainAI/releases/tag/v0.0.13",
    published_at: "2026-11-24T10:00:00Z",
    assets: [
      {
        name: "tongtu_0.0.13_aarch64.dmg",
        browser_download_url: "https://github.com/.../tongtu.dmg",
        size: 6000000,
      },
    ],
  };

  it("解析版本、说明、直链", () => {
    const r = normalizeRelease(json);
    expect(r.version).toBe("0.0.13");
    expect(r.title).toBe("通途 0.0.13");
    expect(r.notes).toContain("路径问题");
    expect(r.downloadUrl).toContain("tongtu.dmg");
  });

  it("没有对应平台附件时回落到发布页，并标记 hasPlatformAsset=false", () => {
    const r = normalizeRelease({ ...json, assets: [] });
    expect(r.downloadUrl).toBe(json.html_url);
    expect(r.hasPlatformAsset).toBe(false);
  });

  it("真实场景：只有 Windows 包时 macOS 拿到发布页", () => {
    const r = normalizeRelease(
      {
        ...json,
        assets: [
          {
            name: "tongtu_0.0.16_x64-setup.exe",
            browser_download_url: "https://github.com/.../setup.exe",
            size: 4653782,
          },
        ],
      },
      "macos"
    );
    expect(r.hasPlatformAsset).toBe(false);
    expect(r.downloadUrl).toContain("/releases");
  });

  it("脏数据不炸", () => {
    const r = normalizeRelease({});
    expect(r.version).toBe("0.0.0");
    expect(r.downloadUrl).toContain("/releases");
  });
});

describe("pickApplicableRelease（跳过无本平台安装包的版本）", () => {
  it("最新版只有 Windows 包时，跳到下一个带 macOS 包的版本", () => {
    const picked = pickApplicableRelease([
      rel("0.0.16", false), // 只有 exe
      rel("0.0.15", false), // 只有 exe
      rel("0.0.14", true), // 有 dmg
      rel("0.0.13", true),
    ]);
    expect(picked?.version).toBe("0.0.14");
  });

  it("全都没有本平台包 → null（不误报有新版本）", () => {
    expect(
      pickApplicableRelease([rel("0.0.16", false), rel("0.0.8", false)])
    ).toBeNull();
  });

  it("第一条就有本平台包 → 直接用它", () => {
    expect(
      pickApplicableRelease([rel("0.0.16", true), rel("0.0.15", true)])
        ?.version
    ).toBe("0.0.16");
  });
});

describe("summarizeNotes", () => {
  it("超长说明截断并加省略号", () => {
    const notes = "a".repeat(500);
    expect(summarizeNotes(notes, 100)).toHaveLength(101);
    expect(summarizeNotes("短说明")).toBe("短说明");
  });
});

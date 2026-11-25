import { describe, it, expect } from "vitest";
import { joinPath, joinPathWith, IS_WINDOWS, PATH_SEP } from "../appPaths";

describe("joinPathWith（Windows 风格）", () => {
  const j = (...segs: Array<string | null | undefined>) =>
    joinPathWith("\\", ...segs);

  it("拼接多段路径", () => {
    expect(j("C:\\App", "notes")).toBe("C:\\App\\notes");
    expect(j("C:\\App", "notes", "sub")).toBe("C:\\App\\notes\\sub");
  });

  it("过滤空段", () => {
    expect(j("C:\\App", "", null, undefined, "notes")).toBe("C:\\App\\notes");
  });

  it("去重分隔符（混合 / 与 \\）", () => {
    expect(j("C:\\App/", "/notes")).toBe("C:\\App\\notes");
    expect(j("C:/App", "notes")).toBe("C:\\App\\notes");
  });
});

describe("joinPathWith（POSIX 风格）", () => {
  const j = (...segs: Array<string | null | undefined>) =>
    joinPathWith("/", ...segs);

  // 回归：早期实现把所有平台的 / 都换成 \，macOS 上绝对路径变相对路径，
  // 导致数据库散落到「文件名带反斜杠」的库里（升级后聊天记录"丢失"）
  it("绝对路径保持绝对", () => {
    expect(j("/Applications/tongtu.app/Contents/MacOS", "chainai.db")).toBe(
      "/Applications/tongtu.app/Contents/MacOS/chainai.db"
    );
  });

  it("带空格的应用数据目录", () => {
    expect(
      j("/Users/u/Library/Application Support/com.16576.chainai", "chainai.db")
    ).toBe("/Users/u/Library/Application Support/com.16576.chainai/chainai.db");
  });

  it("历史反斜杠输入被纠正成正斜杠", () => {
    expect(j("\\Applications\\tongtu.app", "chainai.db")).toBe(
      "/Applications/tongtu.app/chainai.db"
    );
  });

  it("根路径不产生双斜杠", () => {
    expect(j("/", "notes")).toBe("/notes");
  });

  it("尾部分隔符去重", () => {
    expect(j("/a/b/", "/notes")).toBe("/a/b/notes");
  });

  it("过滤空段", () => {
    expect(j("/a", "", null, undefined, "b")).toBe("/a/b");
  });
});

describe("joinPath（当前平台）", () => {
  it("使用平台分隔符", () => {
    expect(PATH_SEP).toBe(IS_WINDOWS ? "\\" : "/");
    expect(joinPath("a", "b")).toBe(IS_WINDOWS ? "a\\b" : "a/b");
  });
});

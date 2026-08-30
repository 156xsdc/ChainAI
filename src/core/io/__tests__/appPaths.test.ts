import { describe, it, expect } from "vitest";
import { joinPath } from "../appPaths";

describe("joinPath", () => {
  it("拼接多段路径（Windows 风格）", () => {
    expect(joinPath("C:\\App", "notes")).toBe("C:\\App\\notes");
    expect(joinPath("C:\\App", "notes", "sub")).toBe("C:\\App\\notes\\sub");
  });

  it("过滤空段", () => {
    expect(joinPath("C:\\App", "", null, undefined, "notes")).toBe(
      "C:\\App\\notes"
    );
  });

  it("去重分隔符（混合 / 与 \\）", () => {
    expect(joinPath("C:\\App/", "/notes")).toBe("C:\\App\\notes");
    expect(joinPath("C:/App", "notes")).toBe("C:\\App\\notes");
  });
});

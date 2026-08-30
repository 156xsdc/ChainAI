import { describe, it, expect } from "vitest";
import { buildDirTree, buildTreeFromPaths, collectDirPaths } from "../dirTree";

describe("buildDirTree", () => {
  it("多级分类构建树形结构并计数", () => {
    const tree = buildDirTree(["", "项目A", "项目A/子项目", "项目A/子项目/深", "读书", ""]);
    expect(tree.map((n) => n.name)).toEqual(["项目A", "读书"]);
    const proj = tree[0];
    expect(proj.noteCount).toBe(1); // category="项目A" 的直接便签
    expect(proj.children.map((c) => c.name)).toEqual(["子项目"]);
    expect(proj.children[0].noteCount).toBe(1); // category="项目A/子项目" 的直接便签
    expect(proj.children[0].children.map((c) => c.name)).toEqual(["深"]);
    expect(proj.children[0].children[0].noteCount).toBe(1);
    expect(tree).toHaveLength(2);
  });

  it("空分类（根目录）计数", () => {
    const tree = buildDirTree(["", ""]);
    expect(tree).toHaveLength(0); // 没有子目录
  });

  it("collectDirPaths 含根目录", () => {
    const tree = buildDirTree(["", "A/B", "A"]);
    const paths = collectDirPaths(tree);
    expect(paths).toContain("");
    expect(paths).toContain("A");
    expect(paths).toContain("A/B");
  });

  it("buildTreeFromPaths 空目录也构建（持久化目录）", () => {
    const tree = buildTreeFromPaths(["A", "A/B", "C"]);
    expect(tree.map((n) => n.name)).toEqual(["A", "C"]);
    expect(tree[0].children[0].name).toBe("B");
    // noteCount 恒 0（由调用方填充）
    expect(tree[0].noteCount).toBe(0);
    // 无重复
    expect(buildTreeFromPaths(["A", "A"])).toHaveLength(1);
  });
});

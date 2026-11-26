import { describe, it, expect, beforeEach } from "vitest";
import {
  buildDocContext,
  formatPageRange,
  mergeDocContexts,
  parsePageRange,
} from "../context";
import { itemsToPageText } from "../../pdf/textItems";
import { createTestDb } from "../../db/__tests__/helpers";
import type { AppRepositories, Document } from "../../db";

const doc = (pages: string[]): Document => ({
  id: "d1",
  treeId: "t1",
  name: "环境毒理学.pdf",
  filePath: "/tmp/x.pdf",
  pageCount: pages.length,
  pages,
  kind: "pdf",
  mimeType: "",
  width: 0,
  height: 0,
  thumb: "",
  createdAt: "",
});

const fivePages = doc(["p1", "p2", "p3", "p4", "p5"]);

describe("parsePageRange", () => {
  it("all / 空 → 全部页", () => {
    expect(parsePageRange("all", 5)).toEqual([0, 1, 2, 3, 4]);
    expect(parsePageRange("", 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("连续区间 / 单页 / 逗号组合", () => {
    expect(parsePageRange("2-4", 5)).toEqual([1, 2, 3]);
    expect(parsePageRange("3", 5)).toEqual([2]);
    expect(parsePageRange("1,4", 5)).toEqual([0, 3]);
  });

  it("越界自动裁剪；完全解析不出来时退回全部", () => {
    expect(parsePageRange("4-99", 5)).toEqual([3, 4]);
    expect(parsePageRange("abc", 5)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("formatPageRange", () => {
  it("连续索引合并成区间（1-based 展示）", () => {
    expect(formatPageRange([0, 1, 2])).toBe("1-3");
    expect(formatPageRange([0])).toBe("1");
    expect(formatPageRange([0, 1, 3])).toBe("1-2,4");
    expect(formatPageRange([])).toBe("");
  });
});

describe("buildDocContext", () => {
  it("按页取文本并带页标记", () => {
    const block = buildDocContext(fivePages, "2-3");
    expect(block.pageCount).toBe(2);
    expect(block.normalizedRange).toBe("2-3");
    expect(block.text).toContain("【参考资料】环境毒理学.pdf（第 2-3 页）");
    expect(block.text).toContain("--- 第 2 页 ---");
    expect(block.text).toContain("--- 第 3 页 ---");
    expect(block.text).not.toContain("p1");
    expect(block.tokens).toBeGreaterThan(0);
  });

  it("全部页时范围显示「全部」", () => {
    const block = buildDocContext(fivePages, "all");
    expect(block.normalizedRange).toBe("1-5");
    expect(block.pageCount).toBe(5);
  });
});

describe("mergeDocContexts", () => {
  it("多份资料合并成一段，token 累加", () => {
    const a = buildDocContext(fivePages, "1");
    const b = buildDocContext({ ...fivePages, id: "d2", name: "另一份.pdf" }, "2");
    const merged = mergeDocContexts([a, b]);
    expect(merged.text).toContain("环境毒理学.pdf");
    expect(merged.text).toContain("另一份.pdf");
    expect(merged.tokens).toBeGreaterThanOrEqual(a.tokens + b.tokens);
  });

  it("空列表返回空", () => {
    expect(mergeDocContexts([])).toEqual({ text: "", tokens: 0 });
  });
});

describe("itemsToPageText（pdf.js 文本片段整理）", () => {
  const item = (str: string, x: number, y: number) => ({
    str,
    transform: [1, 0, 0, 1, x, y],
  });

  it("同一行按 x 排序合并，不同行按 y 从上到下", () => {
    const text = itemsToPageText([
      item("世界", 100, 700),
      item("你好", 40, 700),
      item("第二行", 40, 680),
    ]);
    expect(text).toBe("你好世界\n第二行");
  });

  it("y 差在容差内算同一行；中文之间不插空格，英文之间插空格", () => {
    const text = itemsToPageText([
      item("Cache", 40, 700),
      item("penetration", 90, 700.5),
      item("缓存", 40, 685),
      item("穿透", 80, 685),
    ]);
    expect(text).toBe("Cache penetration\n缓存穿透");
  });

  it("空片段被忽略", () => {
    expect(itemsToPageText([item(" ", 0, 0), item("A", 10, 0)])).toBe("A");
  });
});

describe("documents 仓库", () => {
  let repos: AppRepositories;
  beforeEach(async () => {
    repos = await createTestDb();
  });

  it("创建 / 列出 / 读取 / 删除文档", async () => {
    const tree = await repos.trees.create("资料树");
    const created = await repos.documents.create({
      treeId: tree.id,
      name: "a.pdf",
      filePath: "/tmp/a.pdf",
      pages: ["第一页", "第二页"],
    });
    expect(created.pageCount).toBe(2);

    const list = await repos.documents.listByTree(tree.id);
    expect(list).toHaveLength(1);
    expect(list[0].pages).toEqual(["第一页", "第二页"]);

    const loaded = await repos.documents.getById(created.id);
    expect(loaded?.name).toBe("a.pdf");

    await repos.documents.remove(created.id);
    expect(await repos.documents.listByTree(tree.id)).toHaveLength(0);
  });

  it("节点上的资料引用可持久化与读取", async () => {
    const tree = await repos.trees.create("引用树");
    const node = await repos.nodes.createNode({
      question: "用了资料的问题",
      treeId: tree.id,
    });
    await repos.nodes.updateNode(node.id, {
      docRefs: [{ docId: "d1", name: "a.pdf", pages: "1-3" }],
    });
    const reloaded = await repos.nodes.getNode(node.id);
    expect(reloaded?.docRefs).toEqual([
      { docId: "d1", name: "a.pdf", pages: "1-3" },
    ]);
  });
});

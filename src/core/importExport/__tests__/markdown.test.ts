import { describe, it, expect, beforeEach } from "vitest";
import {
  exportTreeToMarkdown,
  importMarkdownAsTree,
  parseMarkdownTree,
} from "../markdown";
import { createTestDb } from "../../db/__tests__/helpers";
import type { AppRepositories } from "../../db";

const SAMPLE_MD = `# 如何优化网站性能？

可以从缓存、CDN、代码三方面入手。

## 缓存方向

Redis 更好，支持持久化。

### Redis 集群

需要 3 个主节点。

## CDN 方向

Cloudflare 效果不错。`;

describe("Markdown 解析", () => {
  it("解析标题层级与正文", () => {
    const nodes = parseMarkdownTree(SAMPLE_MD);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({
      question: "如何优化网站性能？",
      level: 1,
    });
    expect(nodes[0].answer).toContain("缓存、CDN、代码");
    expect(nodes[1].level).toBe(2);
    expect(nodes[2].question).toBe("Redis 集群");
    expect(nodes[3].question).toBe("CDN 方向");
  });

  it("忽略空行与列表符号不影响标题解析", () => {
    const nodes = parseMarkdownTree("# 标题\n\n正文\n- 列表项\n## 子标题");
    expect(nodes).toHaveLength(2);
    expect(nodes[0].answer).toContain("列表项");
  });

  it("代码围栏内的 # 不解析为标题", () => {
    const md = [
      "# 问题",
      "",
      "```js",
      "// 注释",
      "# 这不是标题",
      "const x = 1;",
      "```",
      "",
      "## 子问题",
      "正文",
    ].join("\n");
    const nodes = parseMarkdownTree(md);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].question).toBe("问题");
    // 围栏内容完整保留在根节点回答中
    expect(nodes[0].answer).toContain("# 这不是标题");
    expect(nodes[0].answer).toContain("const x = 1;");
    expect(nodes[1].question).toBe("子问题");
  });

  it("波浪线围栏（~~~）同样生效", () => {
    const md = "# 问题\n\n~~~\n# 不是标题\n~~~\n\n## 子问题";
    const nodes = parseMarkdownTree(md);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].answer).toContain("# 不是标题");
  });
});

describe("Markdown 导入导出", () => {
  let repo: AppRepositories;

  beforeEach(async () => {
    repo = await createTestDb();
  });

  it("导入重建层级树", async () => {
    const root = await importMarkdownAsTree(repo, SAMPLE_MD);
    expect(root).not.toBeNull();

    const path = await repo.nodes.getPathToRoot(root!.id);
    expect(path.map((p) => p.node.question)).toEqual(["如何优化网站性能？"]);

    // 根的子节点：缓存方向、CDN 方向
    const kids = await repo.nodes.getChildren(root!.id);
    expect(kids.map((k) => k.question)).toEqual(["缓存方向", "CDN 方向"]);
    expect(kids[0].answer).toContain("Redis");

    // 嵌套：Redis 集群 是 缓存方向 的子
    const grandKids = await repo.nodes.getChildren(kids[0].id);
    expect(grandKids.map((k) => k.question)).toEqual(["Redis 集群"]);
    expect(grandKids[0].answer).toContain("3 个主节点");
  });

  it("导出与导入往返一致", async () => {
    const root = await importMarkdownAsTree(repo, SAMPLE_MD);
    const md = await exportTreeToMarkdown(repo, root!.id);

    // 导入导出的文档到新库，结构一致
    const repo2 = await createTestDb();
    const root2 = await importMarkdownAsTree(repo2, md);
    const kids = await repo2.nodes.getChildren(root2!.id);
    expect(kids.map((k) => k.question)).toEqual(["缓存方向", "CDN 方向"]);
    const grand = await repo2.nodes.getChildren(kids[0].id);
    expect(grand[0].question).toBe("Redis 集群");
    expect(grand[0].answer).toContain("3 个主节点");
  });

  it("空内容返回 null", async () => {
    expect(await importMarkdownAsTree(repo, "   ")).toBeNull();
  });

  it("导入含代码围栏的文档：围栏内 # 不产生新节点", async () => {
    const md = [
      "# 问题",
      "",
      "```js",
      "# 这不是标题",
      "```",
      "",
      "## 子问题",
      "正文",
    ].join("\n");
    const root = await importMarkdownAsTree(repo, md);
    expect(root).not.toBeNull();
    // 围栏内 # 未成为节点：根只有"子问题"一个子节点
    const kids = await repo.nodes.getChildren(root!.id);
    expect(kids.map((k) => k.question)).toEqual(["子问题"]);
    expect(kids[0].answer).toContain("正文");
  });
});

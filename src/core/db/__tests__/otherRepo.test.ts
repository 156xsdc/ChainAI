import { describe, it, expect, beforeEach } from "vitest";
import type { AppRepositories } from "../index";
import { createTestDb } from "./helpers";

describe("收藏/分组/便签/设置仓库", () => {
  let repo: AppRepositories;

  beforeEach(async () => {
    repo = await createTestDb();
  });

  it("节点：quote 引用字段持久化（创建/更新/读取）", async () => {
    const node = await repo.nodes.createNode({
      question: "追问",
      quote: "被引用的回答片段……",
    });
    expect((await repo.nodes.getNode(node.id))?.quote).toBe("被引用的回答片段……");

    // 更新 quote（空节点填入场景）
    await repo.nodes.updateNode(node.id, { quote: "新的引用" });
    expect((await repo.nodes.getNode(node.id))?.quote).toBe("新的引用");

    // 无 quote 默认空串
    const plain = await repo.nodes.createNode({ question: "普通问题" });
    expect((await repo.nodes.getNode(plain.id))?.quote).toBe("");
  });

  it("收藏：添加、分组、移动、删除", async () => {
    const node = await repo.nodes.createNode({ question: "重要内容" });
    const group = await repo.favorites.createGroup("核心", "#ff0000", "⭐");

    const fav = await repo.favorites.add(node.id, group.id, "备注");
    expect(fav.groupId).toBe(group.id);
    expect(await repo.favorites.isFavorited(node.id)).toBe(true);

    await repo.favorites.moveToGroup(fav.id, null);
    expect((await repo.favorites.getAll())[0].groupId).toBeNull();

    await repo.favorites.remove(node.id);
    expect(await repo.favorites.isFavorited(node.id)).toBe(false);
    expect(await repo.favorites.getAll()).toHaveLength(0);
  });

  it("收藏分组排序自增", async () => {
    await repo.favorites.createGroup("第一");
    await repo.favorites.createGroup("第二");
    const groups = await repo.favorites.listGroups();
    expect(groups.map((g) => g.name)).toEqual(["第一", "第二"]);
    expect(groups[0].sortOrder).toBe(1);
    expect(groups[1].sortOrder).toBe(2);
  });

  it("节点分组：创建、成员、嵌套", async () => {
    const n1 = await repo.nodes.createNode({ question: "n1" });
    const n2 = await repo.nodes.createNode({ question: "n2" });

    const g1 = await repo.groups.createGroup({ name: "性能优化" });
    await repo.groups.addMembers(g1.id, [n1.id, n2.id]);
    expect(await repo.groups.getMemberIds(g1.id)).toHaveLength(2);
    expect(await repo.groups.getGroupsOfNode(n1.id)).toEqual([g1.id]);

    // 嵌套子分组
    const g2 = await repo.groups.createGroup({ name: "缓存", parentId: g1.id });
    expect(g2.parentId).toBe(g1.id);

    // 更新总结
    await repo.groups.updateGroup(g1.id, { summary: "缓存、CDN、代码三方面" });
    expect((await repo.groups.getGroup(g1.id))?.summary).toContain("CDN");

    // 删除分组级联
    await repo.groups.deleteGroup(g1.id);
    expect(await repo.groups.getGroup(g1.id)).toBeNull();
  });

  it("便签：CRUD + 关联节点 + 标签", async () => {
    const node = await repo.nodes.createNode({ question: "x" });
    const note = await repo.notes.create({
      title: "思考笔记",
      filePath: "D:/notes/思考笔记.md",
      nodeId: node.id,
      tags: ["重要", "灵感"],
    });

    expect(note.tags).toEqual(["重要", "灵感"]);
    expect(await repo.notes.listByNode(node.id)).toHaveLength(1);

    await repo.notes.update(note.id, { title: "改名" });
    expect((await repo.notes.getById(note.id))?.title).toBe("改名");

    await repo.notes.delete(note.id);
    expect(await repo.notes.listAll()).toHaveLength(0);
  });

  it("设置：默认值、存取、覆盖", async () => {
    expect(await repo.settings.get("theme", "light")).toBe("light");

    await repo.settings.set("theme", "dark");
    await repo.settings.set("inheritCount", 8);
    expect(await repo.settings.get("theme", "light")).toBe("dark");
    expect(await repo.settings.get("inheritCount", 0)).toBe(8);

    const all = await repo.settings.getAll();
    expect(all.theme).toBe("dark");
    expect(all.inheritCount).toBe(8);

    await repo.settings.remove("theme");
    expect(await repo.settings.get("theme", "light")).toBe("light");
  });
});

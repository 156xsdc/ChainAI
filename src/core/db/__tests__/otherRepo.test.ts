import { describe, it, expect, beforeEach } from "vitest";
import type { AppRepositories } from "../index";
import { createTestDb } from "./helpers";

describe("收藏/分组/便签/设置仓库", () => {
  let repo: AppRepositories;

  beforeEach(async () => {
    repo = await createTestDb();
  });

  it("树：上下文策略存取（模式/条数/字符串兼容）", async () => {
    const t1 = await repo.trees.create({ name: "全部", inheritMode: "all" });
    expect(t1.inheritMode).toBe("all");
    expect((await repo.trees.getById(t1.id))?.inheritMode).toBe("all");

    const t2 = await repo.trees.create("字符串兼容");
    expect(t2.inheritMode).toBe("count");
    expect((await repo.trees.getById(t2.id))?.inheritCount).toBe(5);

    const t3 = await repo.trees.create({
      name: "固定3",
      inheritMode: "count",
      inheritCount: 3,
    });
    expect((await repo.trees.getById(t3.id))?.inheritCount).toBe(3);

    const t4 = await repo.trees.create({ name: "全新", inheritMode: "none" });
    expect((await repo.trees.getById(t4.id))?.inheritMode).toBe("none");
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

  it("回收站恢复：所属树已删除 → 用问题新建一棵树挂上去", async () => {
    // 生产环境的 SQLite 默认不开外键（删树不会级联删节点，会留下孤儿），
    // 这里对齐生产，否则测试库的 ON DELETE CASCADE 会把节点直接删掉、复现不出问题
    await repo.backend.execute("PRAGMA foreign_keys = OFF");

    const treeA = await repo.trees.create("待删树");
    const node = await repo.nodes.createNode({
      question: "跟我讲讲微囊藻毒素的毒性",
      treeId: treeA.id,
    });
    // 模拟删树：节点软删除 + 进回收站，树行删除
    await repo.nodes.softDeleteMany([node.id]);
    await repo.recycleBin.addMany([node.id]);
    await repo.trees.remove(treeA.id);

    const result = await repo.recycleBin.restore(node.id);

    // 用该节点的问题新建了一棵树（≤20 字，超出加省略号）
    expect(result.restoredNodes).toBe(1);
    expect(result.newTrees).toHaveLength(1);
    expect(result.newTrees[0].name).toBe("跟我讲讲微囊藻毒素的毒性");

    const restored = await repo.nodes.getNode(node.id);
    expect(restored?.isActive).toBe(true);
    expect(restored?.treeId).toBe(result.newTrees[0].id);
    expect((await repo.trees.getById(result.newTrees[0].id))?.name).toBe(
      "跟我讲讲微囊藻毒素的毒性"
    );
  });

  it("恢复新建树时树名去重，空提问回退「恢复的树」", async () => {
    await repo.backend.execute("PRAGMA foreign_keys = OFF");

    const treeA = await repo.trees.create("旧树");
    const withQuestion = await repo.nodes.createNode({
      question: "重复的树名",
      treeId: treeA.id,
    });
    const noQuestion = await repo.nodes.createNode({
      question: "",
      treeId: treeA.id,
    });
    await repo.nodes.softDeleteMany([withQuestion.id, noQuestion.id]);
    await repo.recycleBin.addMany([withQuestion.id, noQuestion.id]);
    await repo.trees.remove(treeA.id);
    // 已存在同名树 → 新树名要加序号
    await repo.trees.create("重复的树名");

    const r1 = await repo.recycleBin.restore(withQuestion.id);
    expect(r1.newTrees[0].name).toBe("重复的树名 (2)");

    const r2 = await repo.recycleBin.restore(noQuestion.id);
    expect(r2.newTrees[0].name).toBe("恢复的树");
  });

  it("树分类：批量归类 / 取消分类 / 分类列表", async () => {
    const a = await repo.trees.create("树A");
    const b = await repo.trees.create("树B");
    expect(a.folder).toBe(""); // 默认未分类

    await repo.trees.setFolder([a.id, b.id], "  学术写作  "); // 自动去空白
    expect((await repo.trees.getById(a.id))?.folder).toBe("学术写作");
    expect((await repo.trees.getById(b.id))?.folder).toBe("学术写作");
    expect(await repo.trees.listFolders()).toEqual(["学术写作"]);

    // 取消其中一棵 → 回到未分类，分类列表随之减少
    await repo.trees.setFolder([b.id], "");
    expect((await repo.trees.getById(b.id))?.folder).toBe("");
    expect(await repo.trees.listFolders()).toEqual(["学术写作"]);

    // 归类不影响节点与删除
    const node = await repo.nodes.createNode({ question: "Q", treeId: a.id });
    await repo.trees.remove(a.id);
    expect(await repo.nodes.getNode(node.id)).toBeNull(); // 软删由调用方处理
  });
});

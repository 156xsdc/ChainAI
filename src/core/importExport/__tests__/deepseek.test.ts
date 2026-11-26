import { describe, it, expect, beforeEach } from "vitest";
import type { AppRepositories } from "../../db";
import { createTestDb } from "../../db/__tests__/helpers";
import {
  importDeepSeekSessions,
  parseDeepSeekSession,
  type DeepSeekSession,
} from "../deepseek";

/** 造一条线性会话：Q1/A1 → Q2/A2 */
const linearSession = {
  id: "s1",
  title: "组学分类讲解",
  inserted_at: "2026-10-29T00:42:16.375Z",
  current_message_id: 4,
  messages: [
    {
      id: 1,
      parent_id: null,
      role: "USER",
      fragments: [{ type: "REQUEST", content: "跟我讲讲组学吧" }],
    },
    {
      id: 2,
      parent_id: 1,
      role: "ASSISTANT",
      fragments: [
        { type: "THINK", content: "先想一下结构" },
        { type: "RESPONSE", content: "组学包括基因组学、转录组学…" },
      ],
    },
    {
      id: 3,
      parent_id: 2,
      role: "USER",
      fragments: [{ type: "REQUEST", content: "那蛋白质组学呢" }],
    },
    {
      id: 4,
      parent_id: 3,
      role: "ASSISTANT",
      fragments: [{ type: "RESPONSE", content: "蛋白质组学研究蛋白表达…" }],
    },
  ],
};

describe("parseDeepSeekSession", () => {
  it("线性会话 → 按顺序的问答对（含思考过程）", () => {
    const s = parseDeepSeekSession(linearSession);
    expect(s.title).toBe("组学分类讲解");
    expect(s.qa).toHaveLength(2);
    expect(s.qa[0]).toEqual({
      question: "跟我讲讲组学吧",
      answer: "组学包括基因组学、转录组学…",
      reasoning: "先想一下结构",
    });
    expect(s.qa[1].question).toBe("那蛋白质组学呢");
    expect(s.hasBranches).toBe(false);
  });

  it("有分支时只取 current_message_id 那条路径", () => {
    // 2 是 Q1 的回答；3/4 是被放弃的旧回答，5/6 是当前路径
    const s = parseDeepSeekSession({
      id: "s2",
      title: "带分支的会话",
      current_message_id: 6,
      messages: [
        { id: 1, parent_id: null, role: "USER", fragments: [{ type: "REQUEST", content: "Q1" }] },
        { id: 3, parent_id: 1, role: "ASSISTANT", fragments: [{ type: "RESPONSE", content: "旧回答" }] },
        { id: 4, parent_id: 3, role: "USER", fragments: [{ type: "REQUEST", content: "旧分支追问" }] },
        { id: 5, parent_id: 1, role: "ASSISTANT", fragments: [{ type: "RESPONSE", content: "新回答" }] },
        { id: 6, parent_id: 5, role: "USER", fragments: [{ type: "REQUEST", content: "新分支追问" }] },
      ],
    });
    expect(s.hasBranches).toBe(true);
    expect(s.qa.map((x) => x.question)).toEqual(["Q1", "新分支追问"]);
    expect(s.qa[0].answer).toBe("新回答");
  });

  it("跳过的片段类型（FILE/TOOL_*）不产生内容", () => {
    const s = parseDeepSeekSession({
      id: "s3",
      title: "带附件",
      messages: [
        {
          id: 1,
          parent_id: null,
          role: "USER",
          fragments: [
            { type: "REQUEST", content: "看这张图" },
            { type: "FILE", content: "a.jpg" },
          ],
        },
        {
          id: 2,
          parent_id: 1,
          role: "ASSISTANT",
          fragments: [
            { type: "TOOL_SEARCH", content: "搜索…" },
            { type: "RESPONSE", content: "图里是…" },
          ],
        },
      ],
    });
    expect(s.qa[0].question).toBe("看这张图");
    expect(s.qa[0].answer).toBe("图里是…");
  });

  it("只有提问没有回答 → 保留为无回答节点", () => {
    const s = parseDeepSeekSession({
      id: "s4",
      title: "半截",
      messages: [
        { id: 1, parent_id: null, role: "USER", fragments: [{ type: "REQUEST", content: "最后一个问题" }] },
      ],
    });
    expect(s.qa).toHaveLength(1);
    expect(s.qa[0]).toEqual({ question: "最后一个问题", answer: "", reasoning: "" });
  });

  it("脏数据不炸", () => {
    const s = parseDeepSeekSession({});
    expect(s.qa).toEqual([]);
    expect(s.title).toBe("（未命名会话）");
  });
});

describe("importDeepSeekSessions", () => {
  let repos: AppRepositories;

  beforeEach(async () => {
    repos = await createTestDb();
    await repos.settings.set("ai.defaultInheritCount", 5);
  });

  const session = (title: string, qaCount: number): DeepSeekSession => ({
    id: title,
    title,
    createdAt: "",
    hasBranches: false,
    skippedMessages: 0,
    qa: Array.from({ length: qaCount }, (_, i) => ({
      question: `${title}-Q${i + 1}`,
      answer: `${title}-A${i + 1}`,
      reasoning: "",
    })),
  });

  it("一个会话一棵树，问答连成一条链", async () => {
    const summary = await importDeepSeekSessions(repos, [
      session("会话甲", 3),
      session("会话乙", 2),
    ]);

    expect(summary.trees).toBe(2);
    expect(summary.nodes).toBe(5);

    // 测试库初始化时会自带一棵「默认树」，这里只看导入产生的
    const trees = (await repos.trees.list()).filter((t) => t.name !== "默认树");
    expect(trees.map((t) => t.name).sort()).toEqual(["会话乙", "会话甲"]);

    const treeA = trees.find((t) => t.name === "会话甲")!;
    const nodes = await repos.nodes.getAllActive(treeA.id);
    expect(nodes).toHaveLength(3);

    // 链式边：3 个节点应有 2 条边，且根节点的父为空
    const root = nodes.find((n) => n.question === "会话甲-Q1")!;
    const mid = nodes.find((n) => n.question === "会话甲-Q2")!;
    const leaf = nodes.find((n) => n.question === "会话甲-Q3")!;
    expect(await repos.nodes.getParents(root.id)).toHaveLength(0);
    expect((await repos.nodes.getParents(mid.id)).map((p) => p.id)).toEqual([root.id]);
    expect((await repos.nodes.getParents(leaf.id)).map((p) => p.id)).toEqual([mid.id]);

    // 节点上的思考过程/回答都写入了
    expect(leaf.answer).toBe("会话甲-A3");
  });

  it("同名会话自动去重；空会话跳过", async () => {
    await importDeepSeekSessions(repos, [session("重名", 1)]);
    const summary = await importDeepSeekSessions(
      repos,
      [session("重名", 1), session("空的", 0)],
      { existingNames: (await repos.trees.list()).map((t) => t.name) }
    );

    expect(summary.trees).toBe(1);
    expect(summary.names[0]).toBe("重名 (2)");
    expect(summary.skippedSessions).toEqual(["空的"]);
    expect(
      (await repos.trees.list())
        .filter((t) => t.name !== "默认树")
        .map((t) => t.name)
        .sort()
    ).toEqual(["重名", "重名 (2)"]);
  });

  it("树的继承策略用全局默认条数", async () => {
    await repos.settings.set("ai.defaultInheritCount", 7);
    await importDeepSeekSessions(repos, [session("策略", 1)]);
    const tree = (await repos.trees.list()).find((t) => t.name === "策略")!;
    expect(tree.inheritMode).toBe("count");
    expect(tree.inheritCount).toBe(7);
  });
});

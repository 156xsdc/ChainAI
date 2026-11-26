import { describe, it, expect, beforeEach } from "vitest";
import { TreeService } from "../../tree/treeService";
import type { AppRepositories } from "../../db";
import { createTestDb } from "../../db/__tests__/helpers";
import { prepareOutgoing } from "../outgoing";
import { policyFromCount, policyToCount, resolveInheritPolicy } from "../policy";

const longText = (i: number) =>
  `第${i}条对话内容，写长一点以便超过摘要预算的下限（40 字），用来验证压缩逻辑`;

describe("继承策略解析", () => {
  it("数值 ↔ 策略互转一致", () => {
    expect(policyFromCount(-1)).toEqual({ mode: "all", count: 0 });
    expect(policyFromCount(0)).toEqual({ mode: "none", count: 0 });
    expect(policyFromCount(7)).toEqual({ mode: "count", count: 7 });
    expect(policyToCount({ mode: "all", count: 0 })).toBe(-1);
    expect(policyToCount({ mode: "none", count: 0 })).toBe(0);
    expect(policyToCount({ mode: "count", count: 7 })).toBe(7);
  });
});

describe("prepareOutgoing", () => {
  let repos: AppRepositories;
  let treeService: TreeService;
  let treeId: string;

  beforeEach(async () => {
    repos = await createTestDb();
    treeService = new TreeService(repos.backend, repos.nodes, repos.sessions);
    const tree = await repos.trees.create({
      name: "测试树",
      inheritMode: "count",
      inheritCount: 3,
    });
    treeId = tree.id;
    await repos.settings.set("ai.defaultInheritCount", 5);
  });

  const deps = () => ({ repos, treeService, currentTreeId: treeId });

  /** 造一条 n 个节点的线性链，返回最后一个节点 id */
  async function buildChain(n: number): Promise<string> {
    let parent: string | null = null;
    let last = "";
    for (let i = 0; i < n; i++) {
      const node = await repos.nodes.createNode({
        question: longText(i),
        answer: `回答${i}`,
        treeId,
      });
      if (parent) await repos.nodes.addEdge(parent, node.id);
      parent = node.id;
      last = node.id;
    }
    return last;
  }

  it("没有分支会话时用树策略（最近 N 条消息）", async () => {
    const leaf = await buildChain(5);
    const policy = await resolveInheritPolicy(deps(), leaf);
    expect(policy).toEqual({ mode: "count", count: 3 });

    const out = await prepareOutgoing(deps(), { nodeId: leaf });
    // 3 条消息 = 2 条来自最后节点 + 1 条…（一问一答分开计）
    expect(out.messages).toHaveLength(3);
    expect(out.policy.mode).toBe("count");
  });

  it("分支会话策略优先于树策略", async () => {
    const root = await repos.nodes.createNode({
      question: longText(0),
      answer: "回答0",
      treeId,
    });
    const branch = await treeService.createBranch(root.id, {
      inheritMode: "count",
      inheritCount: 1,
      treeId,
    });
    await repos.nodes.updateNode(branch.node.id, { question: longText(1) });

    const policy = await resolveInheritPolicy(deps(), branch.node.id);
    expect(policy).toEqual({ mode: "count", count: 1 });

    const out = await prepareOutgoing(deps(), { nodeId: branch.node.id });
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].content).toBe(longText(1));
  });

  it("不继承模式：只带当前问题", async () => {
    const root = await repos.nodes.createNode({
      question: longText(0),
      answer: "回答0",
      treeId,
    });
    const start = await treeService.createNewStart(root.id, { treeId });
    await repos.nodes.updateNode(start.node.id, { question: "新方向的问题" });

    const out = await prepareOutgoing(deps(), { nodeId: start.node.id });
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]).toEqual({ role: "user", content: "新方向的问题" });
  });

  it("预检估算用压缩后的预算，且不调用摘要函数", async () => {
    const leaf = await buildChain(20);
    await repos.trees.updatePolicy(treeId, {
      inheritMode: "count",
      inheritCount: 40,
    });

    let called = 0;
    const compressFn = async () => {
      called++;
      return "摘要";
    };

    const estimate = await prepareOutgoing(deps(), {
      nodeId: leaf,
      compressFn,
      estimateOnly: true,
    });
    const real = await prepareOutgoing(deps(), { nodeId: leaf, compressFn });

    // 预检不调 AI
    expect(called).toBeGreaterThan(0);
    expect(estimate.messages).toEqual([]);
    // 预检是「上界」：按预算折算 ≥ 模型实际写出的摘要长度
    expect(estimate.estimatedTokens).toBeGreaterThanOrEqual(
      real.estimatedTokens
    );
    // 并且确实比未压缩的原文小
    expect(estimate.plan.estimatedTokens).toBeLessThan(
      estimate.plan.rawTokens
    );
  });

  it("预检把「当前问题」和「引用」计入估算", async () => {
    const leaf = await buildChain(3);
    const base = await prepareOutgoing(deps(), {
      nodeId: leaf,
      estimateOnly: true,
    });
    const withQuestion = await prepareOutgoing(deps(), {
      nodeId: leaf,
      appendUserMessage: "这是一个还没有落库的新问题，内容比较长一些",
      estimateOnly: true,
    });
    expect(withQuestion.estimatedTokens).toBeGreaterThan(base.estimatedTokens);

    const quoteNode = await repos.nodes.getNode(leaf);
    const withQuote = await prepareOutgoing(deps(), {
      nodeId: leaf,
      appendUserMessage: "追问",
      quote: { nodeId: quoteNode!.id, text: quoteNode!.answer },
      estimateOnly: true,
    });
    expect(withQuote.estimatedTokens).toBeGreaterThan(
      withQuestion.estimatedTokens
    );
  });

  it("重新生成：去掉末尾旧回答，末尾一定是用户问题", async () => {
    const leaf = await buildChain(3);
    const out = await prepareOutgoing(deps(), {
      nodeId: leaf,
      dropTrailingAssistant: true,
    });
    expect(out.messages[out.messages.length - 1].role).toBe("user");
    expect(out.messages.some((m) => m.content === "回答2")).toBe(false);
  });

  it("重新生成也遵守继承策略（不再全量发出）", async () => {
    const leaf = await buildChain(20);
    await repos.trees.updatePolicy(treeId, {
      inheritMode: "count",
      inheritCount: 4,
    });
    const out = await prepareOutgoing(deps(), {
      nodeId: leaf,
      dropTrailingAssistant: true,
    });
    expect(out.messages.length).toBeLessThanOrEqual(4);
  });

  it("引用注入：带上被引用节点的问答", async () => {
    const leaf = await buildChain(2);
    const quoted = await repos.nodes.createNode({
      question: "被引用的老问题",
      answer: "被引用的老回答",
      treeId,
    });

    const out = await prepareOutgoing(deps(), {
      nodeId: leaf,
      quote: { nodeId: quoted.id, text: "被引用的老回答" },
    });
    const contents = out.messages.map((m) => m.content);
    expect(contents).toContain("被引用的老问题");
    expect(contents).toContain("被引用的老回答");
    expect(contents[contents.length - 1]).toContain("【引用内容】");
  });

  it("摘要以 system 消息注入，且只有一条", async () => {
    const leaf = await buildChain(20);
    await repos.trees.updatePolicy(treeId, {
      inheritMode: "all",
      inheritCount: 0,
    });
    const out = await prepareOutgoing(deps(), {
      nodeId: leaf,
      compressFn: async () => "压缩后的历史摘要",
    });
    const systems = out.messages.filter((m) => m.role === "system");
    expect(systems).toHaveLength(1);
    expect(systems[0].content).toContain("【更早对话摘要】");
  });
});

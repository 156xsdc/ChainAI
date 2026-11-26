import { describe, it, expect } from "vitest";
import { weightForIndex, bandLabelForIndex } from "../weights";
import {
  buildContext,
  groupByWeight,
  materializeContext,
  planContext,
  type ContextMessage,
} from "../builder";

const msg = (i: number): ContextMessage => ({
  role: i % 2 === 0 ? "user" : "assistant",
  content: `消息${i}`,
});

const seq = (n: number) => Array.from({ length: n }, (_, i) => msg(i));

describe("时间权重", () => {
  it("最近5条权重 1.0", () => {
    for (let i = 0; i <= 4; i++) expect(weightForIndex(i)).toBe(1);
  });
  it("6-15 条权重 0.7", () => {
    expect(weightForIndex(5)).toBe(0.7);
    expect(weightForIndex(14)).toBe(0.7);
  });
  it("16-30 条权重 0.4", () => {
    expect(weightForIndex(15)).toBe(0.4);
    expect(weightForIndex(29)).toBe(0.4);
  });
  it("31-50 条权重 0.2", () => {
    expect(weightForIndex(30)).toBe(0.2);
    expect(weightForIndex(49)).toBe(0.2);
  });
  it("50+ 条权重 0.1", () => {
    expect(weightForIndex(50)).toBe(0.1);
    expect(weightForIndex(100)).toBe(0.1);
  });
  it("区间标签", () => {
    expect(bandLabelForIndex(0)).toBe("完整保留");
    expect(bandLabelForIndex(7)).toBe("轻度压缩");
  });
});

describe("groupByWeight", () => {
  it("按区间分组且保持从旧到新顺序", () => {
    const messages = seq(20); // 20条：0-19（旧→新）
    const groups = groupByWeight(messages);
    // idx：消息0-4→19-15 (0.4)；5-14→14-5 (0.7)；15-19→4-0 (1.0)
    expect(groups.length).toBe(3);
    expect(groups[0].messages[0].content).toBe("消息0"); // 0.4 中度组
    expect(groups[1].messages[0].content).toBe("消息5"); // 0.7 轻度组
    expect(groups[2].messages[0].content).toBe("消息15"); // 1.0 完整组
  });

  it("每组都算出「预算 = 原文长度 × 权重」（权重真实生效）", () => {
    const messages = seq(20);
    const groups = groupByWeight(messages);
    for (const g of groups) {
      expect(g.budgetChars).toBe(Math.round(g.rawChars * g.weight));
      expect(g.weight).toBeLessThanOrEqual(1);
    }
    // 越旧的组权重越小 → 预算/原文比越小
    const ratios = groups.map((g) => g.budgetChars / g.rawChars);
    expect(ratios[0]).toBeLessThan(ratios[1]);
    expect(ratios[1]).toBeLessThan(ratios[2]);
  });
});

describe("planContext", () => {
  it("不继承 → 空计划", () => {
    const plan = planContext(seq(10), { inheritMode: "none" });
    expect(plan.recent).toEqual([]);
    expect(plan.groups).toEqual([]);
    expect(plan.estimatedTokens).toBe(0);
    expect(plan.droppedCount).toBe(10);
  });

  it("count 模式：只保留最近 N 条并记录丢弃数", () => {
    const plan = planContext(seq(10), {
      inheritMode: "count",
      inheritCount: 3,
      compress: false,
    });
    expect(plan.recent.map((m) => m.content)).toEqual([
      "消息7",
      "消息8",
      "消息9",
    ]);
    expect(plan.droppedCount).toBe(7);
    expect(plan.recentCount).toBe(3);
  });

  it("perChain（合并节点）：不做全局二次截断", () => {
    const plan = planContext(seq(10), {
      inheritMode: "count",
      inheritCount: 3,
      perChain: true,
      compress: false,
    });
    expect(plan.recent).toHaveLength(10);
    expect(plan.droppedCount).toBe(0);
  });

  it("压缩后估算 < 原文估算（预检用的就是压缩后的值）", () => {
    const plan = planContext(seq(40), {
      inheritMode: "all",
      recentKeep: 5,
    });
    expect(plan.groups.length).toBeGreaterThan(0);
    expect(plan.estimatedTokens).toBeLessThan(plan.rawTokens);
    // 最近 5 条完整保留
    expect(plan.recent.map((m) => m.content)).toEqual([
      "消息35",
      "消息36",
      "消息37",
      "消息38",
      "消息39",
    ]);
  });

  it("条数不超过 recentKeep → 不压缩", () => {
    const plan = planContext(seq(4), { inheritMode: "all" });
    expect(plan.groups).toEqual([]);
    expect(plan.recent).toHaveLength(4);
  });
});

describe("materializeContext", () => {
  it("摘要合并成一条 system 消息（不再伪装成用户发言）", async () => {
    const plan = planContext(seq(12), { inheritMode: "all", recentKeep: 5 });
    const out = await materializeContext(plan, {
      compressFn: async (group) => `摘要(${group[0].content})`,
    });
    const systems = out.filter((m) => m.role === "system");
    expect(systems).toHaveLength(1);
    expect(systems[0].content).toContain("【更早对话摘要】");
    expect(out.filter((m) => m.role === "user").every((m) => !m.content.includes("摘要"))).toBe(true);
    expect(out[out.length - 1].content).toBe("消息11");
  });

  it("摘要超预算被截断到「原文长度 × 权重」", async () => {
    const plan = planContext(seq(30), { inheritMode: "all", recentKeep: 5 });
    const group = plan.groups[0];
    const out = await materializeContext(plan, {
      compressFn: async () => "很长的摘要".repeat(500),
    });
    const block = out[0].content;
    // 该区间预算内的正文长度不应超过预算（多留一点给标签）
    expect(block.length).toBeLessThan(group.budgetChars + 80);
  });

  it("摘要函数失败 → 降级为原文按预算截断（不会整段丢失）", async () => {
    const plan = planContext(seq(12), { inheritMode: "all", recentKeep: 5 });
    const out = await materializeContext(plan, {
      compressFn: async () => {
        throw new Error("AI 不可用");
      },
    });
    expect(out[0].role).toBe("system");
    expect(out[0].content).toContain("消息0"); // 原文兜底
    expect(out[out.length - 1].content).toBe("消息11");
  });

  it("没有摘要函数 → 原文按预算截断", async () => {
    const plan = planContext(seq(12), { inheritMode: "all", recentKeep: 5 });
    const out = await materializeContext(plan);
    expect(out[0].role).toBe("system");
    expect(out).toHaveLength(6); // 1 条摘要 + 5 条原文
  });
});

describe("buildContext（兼容入口）", () => {
  it("全部继承且无压缩 → 原文全量", async () => {
    const r = await buildContext(seq(6), {
      inheritMode: "all",
      compress: false,
    });
    expect(r.map((m) => m.content)).toEqual(seq(6).map((m) => m.content));
  });

  it("count + 压缩：继承范围内再按权重压缩", async () => {
    // 用较长的消息内容，让该区间预算超过"值得调 AI"的下限（40 字）
    const messages: ContextMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `第${i}条比较长的消息内容，用来触发摘要预算`,
    }));
    const r = await buildContext(messages, {
      inheritMode: "count",
      inheritCount: 12, // 保留第8~19条
      recentKeep: 5,
      compressFn: async () => "摘要",
    });
    expect(r[r.length - 1].content).toContain("第19条");
    expect(r[0].role).toBe("system");
    expect(r[0].content).toContain("摘要");
    // 被摘要覆盖的原文不再单独出现
    expect(r[0].content).not.toContain("第8条");
  });
});

import { describe, it, expect } from "vitest";
import { weightForIndex, bandLabelForIndex } from "../weights";
import { buildContext, groupByWeight, type ContextMessage } from "../builder";

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
    expect(groups[0][0].content).toBe("消息0"); // 0.4 中度组
    expect(groups[1][0].content).toBe("消息5"); // 0.7 轻度组
    expect(groups[2][0].content).toBe("消息15"); // 1.0 完整组
  });
});

describe("buildContext", () => {
  it("不继承 → 空", async () => {
    const r = await buildContext(seq(10), { inheritMode: "none" });
    expect(r).toEqual([]);
  });

  it("count 模式：只保留最近 N 条", async () => {
    const r = await buildContext(seq(10), { inheritMode: "count", inheritCount: 3 });
    expect(r.map((m) => m.content)).toEqual(["消息7", "消息8", "消息9"]);
  });

  it("全部继承且无压缩 → 原文全量", async () => {
    const r = await buildContext(seq(6), { inheritMode: "all", compress: false });
    expect(r.map((m) => m.content)).toEqual(seq(6).map((m) => m.content));
  });

  it("压缩：旧消息分组摘要 + 最近保留原文，顺序从旧到新", async () => {
    const messages = seq(12); // 12条
    const r = await buildContext(messages, {
      inheritMode: "all",
      recentKeep: 5,
      compressFn: async (group) => `摘要(${group[0].content}~${group[group.length - 1].content})`,
    });
    // 最近5条原文 = 消息7~11；旧消息0~6 的全局 idx = 11..5 → 都在 0.7 区间 → 1组
    expect(r.length).toBe(6);
    expect(r[0].content).toContain("【更早对话摘要】摘要(消息0~消息6)");
    expect(r[1].content).toBe("消息7");
    expect(r[r.length - 1].content).toBe("消息11");
  });

  it("消息少于 recentKeep → 不压缩全部原文", async () => {
    const r = await buildContext(seq(4), {
      inheritMode: "all",
      compressFn: async (_g) => "不应调用",
    });
    expect(r.map((m) => m.content)).toEqual(["消息0", "消息1", "消息2", "消息3"]);
  });

  it("压缩函数失败 → 降级为原文", async () => {
    const messages = seq(12);
    const r = await buildContext(messages, {
      inheritMode: "all",
      compressFn: async () => {
        throw new Error("AI 不可用");
      },
    });
    expect(r.map((m) => m.content)).toEqual(messages.map((m) => m.content));
  });

  it("count + 压缩：继承范围内再按权重压缩", async () => {
    const messages = seq(20);
    const r = await buildContext(messages, {
      inheritMode: "count",
      inheritCount: 12, // 保留消息8~19
      recentKeep: 5,
      compressFn: async (_g) => `摘要`,
    });
    // 消息8~19 中最近5条 = 消息15~19 原文；消息8~14 需压缩（idx 5-11 → 0.7 一组）
    expect(r[r.length - 1].content).toBe("消息19");
    expect(r[0].content).toContain("【更早对话摘要】摘要");
    expect(r[0].content).not.toContain("消息8"); // 摘要替换原文
  });
});

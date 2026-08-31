import { describe, it, expect, vi } from "vitest";
import { Typewriter } from "../typewriter";

describe("Typewriter", () => {
  it("阈值内不显示，达到阈值后开始", () => {
    vi.useFakeTimers();
    const onDisplay = vi.fn();
    const tw = new Typewriter(onDisplay, {
      threshold: 5,
      charsPerSecond: 1000, // 极快，下一个 tick 全部显示
      tickMs: 10,
    });
    tw.feed("abc");
    expect(onDisplay).not.toHaveBeenCalled();
    tw.feed("de"); // 累计5字，达到阈值 → 启动 timer
    vi.advanceTimersByTime(10);
    expect(onDisplay).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("finish 后加速吐完剩余内容（不瞬间闪现全文）", async () => {
    vi.useFakeTimers();
    const onDisplay = vi.fn();
    const tw = new Typewriter(onDisplay, {
      threshold: 0,
      charsPerSecond: 100, // 匀速 100字/秒，10ms tick → 每tick 1字
      tickMs: 10,
      finishSpeed: 10, // 结束追赶 10倍速 → 每tick 10字
    });
    tw.feed("一二三四五六七八九十"); // 10字
    vi.advanceTimersByTime(10);
    expect(onDisplay).toHaveBeenLastCalledWith("一"); // 匀速阶段只显示1字

    const done = tw.finish();
    // finish 后不是瞬间补齐（尚未推进 timer）
    expect(onDisplay).not.toHaveBeenLastCalledWith("一二三四五六七八九十");
    // 加速追赶：剩余9字，每tick 10字 → 1-2 tick 吐完
    await vi.advanceTimersByTimeAsync(30);
    await done;
    expect(onDisplay).toHaveBeenLastCalledWith("一二三四五六七八九十");
    vi.useRealTimers();
  });

  it("匀速显示：每次 tick 输出速度对应的字数", () => {
    vi.useFakeTimers();
    const onDisplay = vi.fn();
    const tw = new Typewriter(onDisplay, {
      threshold: 0, // 立即开始
      charsPerSecond: 20, // 每秒20字，50ms tick → 每tick 1字
      tickMs: 50,
    });
    tw.feed("一二三四五六七八九十");
    // 第一次 tick 后显示 1 字
    vi.advanceTimersByTime(50);
    expect(onDisplay).toHaveBeenLastCalledWith("一");
    vi.advanceTimersByTime(50);
    expect(onDisplay).toHaveBeenLastCalledWith("一二");
    vi.useRealTimers();
  });

  it("接收速度慢于显示速度时追平后暂停", () => {
    vi.useFakeTimers();
    const onDisplay = vi.fn();
    const tw = new Typewriter(onDisplay, {
      threshold: 0,
      charsPerSecond: 20,
      tickMs: 50,
    });
    tw.feed("ab");
    vi.advanceTimersByTime(50);
    expect(onDisplay).toHaveBeenLastCalledWith("a");
    vi.advanceTimersByTime(50);
    expect(onDisplay).toHaveBeenLastCalledWith("ab");
    // 已追平，后续 tick 不再重复回调
    vi.advanceTimersByTime(100);
    const calls = onDisplay.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(onDisplay.mock.calls.length).toBe(calls);
    vi.useRealTimers();
  });

  it("fullText 返回全部接收内容", () => {
    const tw = new Typewriter(() => {}, { threshold: 100 });
    tw.feed("aaa");
    tw.feed("bbb");
    expect(tw.fullText).toBe("aaabbb");
  });
});

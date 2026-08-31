/**
 * 打字机效果：累计到阈值后匀速显示，跟随流式输入
 *
 * 规则（对应需求文档）：
 * 1. AI 开始生成 → 暂不显示
 * 2. 累计到阈值字数（默认200字）→ 开始匀速显示
 * 3. 匀速速度：默认 30 字/秒
 * 4. 生成完毕 → 加速吐完剩余内容（不瞬间闪现全文，对阅读友好）
 */
export interface TypewriterOptions {
  /** 开始显示前累计的阈值（字数），默认 200 */
  threshold?: number;
  /** 显示速度（字/秒），默认 30 */
  charsPerSecond?: number;
  /** 时钟间隔（毫秒），默认 50 */
  tickMs?: number;
  /** 结束追赶速度倍数（默认 10），finish 后按 速度×倍数 吐完剩余 */
  finishSpeed?: number;
}

export class Typewriter {
  private received = "";
  private displayed = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private carry = 0;
  private readonly threshold: number;
  private readonly cps: number;
  private readonly tickMs: number;
  private readonly finishSpeed: number;
  /** 结束追赶中：用加速速度吐完剩余内容 */
  private finishing = false;
  private onDone: (() => void) | null = null;

  constructor(
    private readonly onDisplay: (text: string) => void,
    options: TypewriterOptions = {}
  ) {
    this.threshold = options.threshold ?? 200;
    this.cps = options.charsPerSecond ?? 30;
    this.tickMs = options.tickMs ?? 50;
    this.finishSpeed = options.finishSpeed ?? 10;
  }

  /** 接收新的增量文本 */
  feed(text: string): void {
    if (!text) return;
    this.received += text;
    if (!this.timer && this.received.length >= this.threshold) {
      this.start();
    }
  }

  /**
   * 流结束：加速吐完剩余内容（不瞬间闪现全文）
   * @returns Promise，剩余内容全部显示后 resolve（带安全超时，避免挂起）
   */
  finish(): Promise<void> {
    return new Promise((resolve) => {
      // 已全部显示（或没有内容）：直接完成
      if (this.displayed.length >= this.received.length) {
        this.stop();
        resolve();
        return;
      }
      this.finishing = true;
      if (!this.timer) this.start(); // 内容不足阈值尚未启动：加速吐完
      this.onDone = resolve;
      // 安全超时：极端情况（如后台窗口 setInterval 被节流）不挂起调用方
      setTimeout(() => {
        if (this.onDone) {
          this.stop();
          this.onDone();
          this.onDone = null;
        }
      }, 3000);
    });
  }

  /** 已接收全文（用于最终落库） */
  get fullText(): string {
    return this.received;
  }

  private start(): void {
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (this.displayed.length >= this.received.length) {
      // 已追平：结束阶段停止；普通阶段等待新内容
      if (this.finishing) {
        this.stop();
        this.onDone?.();
        this.onDone = null;
      }
      return;
    }
    // 结束追赶时用加速速度，其余匀速
    const speed = this.finishing ? this.cps * this.finishSpeed : this.cps;
    this.carry += (speed * this.tickMs) / 1000;
    const n = Math.floor(this.carry);
    if (n <= 0) return;
    this.carry -= n;
    this.displayed = this.received.slice(0, this.displayed.length + n);
    this.onDisplay(this.displayed);
  }
}

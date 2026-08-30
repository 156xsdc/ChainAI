/**
 * 打字机效果：累计到阈值后匀速显示，跟随流式输入
 *
 * 规则（对应需求文档）：
 * 1. AI 开始生成 → 暂不显示
 * 2. 累计到阈值字数（默认200字）→ 开始匀速显示
 * 3. 匀速速度：默认 30 字/秒
 * 4. 生成完毕 → 立即补齐全部内容
 */
export interface TypewriterOptions {
  /** 开始显示前累计的阈值（字数），默认 200 */
  threshold?: number;
  /** 显示速度（字/秒），默认 30 */
  charsPerSecond?: number;
  /** 时钟间隔（毫秒），默认 50 */
  tickMs?: number;
}

export class Typewriter {
  private received = "";
  private displayed = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private carry = 0;
  private readonly threshold: number;
  private readonly cps: number;
  private readonly tickMs: number;

  constructor(
    private readonly onDisplay: (text: string) => void,
    options: TypewriterOptions = {}
  ) {
    this.threshold = options.threshold ?? 200;
    this.cps = options.charsPerSecond ?? 30;
    this.tickMs = options.tickMs ?? 50;
  }

  /** 接收新的增量文本 */
  feed(text: string): void {
    if (!text) return;
    this.received += text;
    if (!this.timer && this.received.length >= this.threshold) {
      this.start();
    }
  }

  /** 流结束：立即补齐全部内容 */
  finish(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.displayed !== this.received) {
      this.displayed = this.received;
      this.onDisplay(this.displayed);
    }
  }

  /** 已接收全文（用于最终落库） */
  get fullText(): string {
    return this.received;
  }

  private start(): void {
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private tick(): void {
    if (this.displayed.length >= this.received.length) return; // 已追上，等待新内容
    this.carry += (this.cps * this.tickMs) / 1000;
    const n = Math.floor(this.carry);
    if (n <= 0) return;
    this.carry -= n;
    this.displayed = this.received.slice(0, this.displayed.length + n);
    this.onDisplay(this.displayed);
  }
}

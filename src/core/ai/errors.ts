/**
 * 统一的错误类型：将各提供商的错误归一化为可读的中文提示。
 */

export type ChatErrorCode =
  | "network" // 网络不通 / 连接失败
  | "auth" // 认证失败（401/403）
  | "rate_limit" // 限流（429）
  | "bad_request" // 请求错误（4xx）
  | "server" // 服务端错误（5xx）
  | "timeout" // 超时
  | "aborted" // 用户中断
  | "unknown";

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly status?: number;
  readonly providerId?: string;

  constructor(
    code: ChatErrorCode,
    message: string,
    opts?: { status?: number; providerId?: string; cause?: unknown }
  ) {
    super(message, { cause: opts?.cause });
    this.name = "ChatError";
    this.code = code;
    this.status = opts?.status;
    this.providerId = opts?.providerId;
  }

  /** 根据 HTTP 状态码映射错误类型 */
  static fromStatus(status: number, body?: string, providerId?: string): ChatError {
    switch (status) {
      case 401:
      case 403:
        return new ChatError("auth", "认证失败：API Key 无效或没有权限", {
          status,
          providerId,
        });
      case 429:
        return new ChatError("rate_limit", "请求过于频繁，已被限流（429）", {
          status,
          providerId,
        });
      default:
        if (status >= 500) {
          return new ChatError("server", `服务端错误（${status}）`, {
            status,
            providerId,
          });
        }
        return new ChatError(
          "bad_request",
          `请求错误（${status}）：${body ? truncate(body, 300) : "未知原因"}`,
          { status, providerId }
        );
    }
  }

  /** 从任意异常归一化 */
  static fromError(err: unknown, providerId?: string): ChatError {
    if (err instanceof ChatError) return err;

    if (err instanceof DOMException && err.name === "AbortError") {
      return new ChatError("aborted", "已停止生成", { providerId });
    }

    if (err instanceof TypeError) {
      // fetch 网络层错误
      return new ChatError("network", "无法连接到服务，请检查网络和地址", {
        providerId,
        cause: err,
      });
    }

    const msg = err instanceof Error ? err.message : String(err);
    return new ChatError("unknown", `未知错误：${msg}`, {
      providerId,
      cause: err,
    });
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

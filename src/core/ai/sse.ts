/**
 * 流式响应解析器
 * - SSE（Server-Sent Events）：OpenAI / Anthropic
 * - NDJSON（逐行JSON）：Ollama
 */

export interface SSEEvent {
  /** 事件名（如 Anthropic 的 content_block_delta），无则为 null */
  event: string | null;
  /** data 字段内容（多行 data 自动拼接） */
  data: string;
}

export interface StreamParser {
  push(chunk: string): void;
  /** 流结束时调用，处理未以空行结尾的残留数据 */
  flush(): void;
}

/**
 * SSE 解析器工厂
 * 处理规则：`event:` 记录事件名，`data:` 追加数据，空行触发一次回调。
 */
export function createSSEParser(
  onEvent: (ev: SSEEvent) => void
): StreamParser {
  let buffer = "";
  let currentEvent: string | null = null;
  let currentData: string[] = [];

  const flush = () => {
    if (currentEvent === null && currentData.length === 0) return;
    onEvent({ event: currentEvent, data: currentData.join("\n") });
    currentEvent = null;
    currentData = [];
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const trimmed = line.trim();
        if (trimmed === "") {
          flush();
          continue;
        }
        const colon = line.indexOf(":");
        if (colon === -1) continue;
        const field = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).replace(/^\s/, "").replace(/\r$/, "");
        if (field === "event") {
          currentEvent = value;
        } else if (field === "data") {
          currentData.push(value);
        }
        // 忽略 id / retry 等字段
      }
    },
    flush() {
      // 处理尾部残留（无空行结尾的情况）
      if (buffer.trim() !== "") {
        const line = buffer.trim().replace(/\r$/, "");
        const colon = line.indexOf(":");
        if (colon !== -1) {
          const field = line.slice(0, colon).trim();
          const value = line.slice(colon + 1).replace(/^\s/, "");
          if (field === "event") {
            currentEvent = value;
          } else if (field === "data") {
            currentData.push(value);
          }
        }
      }
      buffer = "";
      flush();
    },
  };
}

/** 逐行解析器（NDJSON 等） */
export function createLineParser(
  onLine: (line: string) => void
): StreamParser {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.trim() !== "") onLine(line);
      }
    },
    flush() {
      if (buffer.trim() !== "") onLine(buffer.replace(/\r$/, ""));
      buffer = "";
    },
  };
}

/** 安全 JSON 解析，失败返回 null */
export function parseJSONSafe<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

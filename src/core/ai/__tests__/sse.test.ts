import { describe, it, expect } from "vitest";
import { createSSEParser, createLineParser, parseJSONSafe } from "../sse";

describe("createSSEParser", () => {
  it("解析标准 SSE 事件", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push('data: {"a":1}\n\n');
    expect(events).toEqual([{ event: null, data: '{"a":1}' }]);
  });

  it("跨 chunk 分片也能正确解析", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push('data: {"a"');
    parser.push(':1}\n\ndata: {"b":2}\n\n');
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('{"a":1}');
    expect(events[1].data).toBe('{"b":2}');
  });

  it("解析 event 字段（Anthropic 格式）", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push(
      'event: content_block_delta\ndata: {"delta":{"text":"hi"}}\n\n'
    );
    expect(events[0].event).toBe("content_block_delta");
  });

  it("多行 data 拼接", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push("data: line1\ndata: line2\n\n");
    expect(events[0].data).toBe("line1\nline2");
  });

  it("flush 处理无空行结尾的残留数据", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push('data: {"x":1}\n\ndata: {"y":2}');
    parser.flush();
    expect(events).toHaveLength(2);
    expect(events[1].data).toBe('{"y":2}');
  });

  it("支持 CRLF 行结束符", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push('data: {"a":1}\r\n\r\n');
    expect(events[0].data).toBe('{"a":1}');
  });

  it("忽略 id/retry 等无关字段", () => {
    const events: Array<{ event: string | null; data: string }> = [];
    const parser = createSSEParser((e) => events.push(e));
    parser.push('id: 1\nretry: 100\ndata: ok\n\n');
    expect(events).toEqual([{ event: null, data: "ok" }]);
  });
});

describe("createLineParser", () => {
  it("逐行解析 NDJSON", () => {
    const lines: string[] = [];
    const parser = createLineParser((l) => lines.push(l));
    parser.push('{"a":1}\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("处理 CRLF 和末尾无换行", () => {
    const lines: string[] = [];
    const parser = createLineParser((l) => lines.push(l));
    parser.push('{"a":1}\r\n{"b":2}');
    parser.flush();
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe("parseJSONSafe", () => {
  it("合法 JSON 正常解析", () => {
    expect(parseJSONSafe('{"a":1}')).toEqual({ a: 1 });
  });
  it("非法 JSON 返回 null", () => {
    expect(parseJSONSafe("not json")).toBeNull();
  });
});

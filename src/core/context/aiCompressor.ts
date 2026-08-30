/**
 * AI 上下文压缩器：调用模型将历史消息压缩为摘要
 * 保留关键决策、结论、数据、待办事项
 */
import { providerManager } from "../ai/manager";
import type { ProviderConfig } from "../ai/types";
import type { ContextMessage } from "./builder";

const SUMMARY_PROMPT = `请将以下 AI 对话历史压缩为简洁的中文摘要。
要求：
- 保留：关键决策、结论、重要数据、待办事项、当前进度
- 忽略：寒暄、重复内容、无关信息
- 直接输出摘要正文，不要任何解释、前言或格式修饰`;

export function formatHistoryForSummary(messages: ContextMessage[]): string {
  return messages
    .map((m) => {
      const who = m.role === "user" ? "用户" : m.role === "assistant" ? "AI" : "系统";
      return `[${who}] ${m.content}`;
    })
    .join("\n");
}

/**
 * 生成一组消息的摘要
 * @param timeoutMs 超时（默认 30 秒）
 */
export async function summarizeGroup(
  messages: ContextMessage[],
  config?: ProviderConfig,
  timeoutMs = 30_000
): Promise<string> {
  if (messages.length === 0) return "";
  const history = formatHistoryForSummary(messages);
  const prompt = `${SUMMARY_PROMPT}\n\n对话历史：\n${history}`;

  let summary = "";
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for await (const chunk of providerManager.chat(
      { messages: [{ role: "user", content: prompt }], signal },
      config
    )) {
      if (chunk.delta) summary += chunk.delta;
    }
  } catch {
    // 压缩失败由调用方降级处理
  }
  return summary.trim();
}

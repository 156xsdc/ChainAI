/**
 * AI 辅助总结：对一组节点生成总结（分组总结 / 手动总结）
 */
import { providerManager } from "../ai/manager";
import type { ProviderConfig } from "../ai/types";
import type { AppRepositories } from "../db";

export interface SummarizableMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 对消息列表生成中文总结
 * @param messages 问答消息序列
 * @param config 使用的 AI 配置（默认当前活跃配置）
 * @param timeoutMs 超时
 */
export async function summarizeMessages(
  messages: SummarizableMessage[],
  config?: ProviderConfig,
  timeoutMs = 30_000
): Promise<string> {
  if (messages.length === 0) return "";
  const content = messages
    .map((m) => `[${m.role === "user" ? "用户" : "AI"}] ${m.content}`)
    .join("\n");
  const prompt = `请对以下一组对话进行总结，提炼：主题、关键结论、重要要点。
要求：使用简洁的中文，可用短段落或要点列表；直接输出总结正文，不要前言。

对话内容：
${content}`;

  let summary = "";
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    for await (const chunk of providerManager.chat(
      { messages: [{ role: "user", content: prompt }], signal },
      config
    )) {
      if (chunk.delta) summary += chunk.delta;
    }
  } catch {
    // 失败由调用方处理
  }
  return summary.trim();
}

/**
 * 对一组节点生成总结（读取节点的问答内容）
 */
export async function summarizeNodeGroup(
  repos: AppRepositories,
  nodeIds: string[]
): Promise<string> {
  const messages: SummarizableMessage[] = [];
  for (const id of nodeIds) {
    const node = await repos.nodes.getNode(id);
    if (!node) continue;
    if (node.question) messages.push({ role: "user", content: node.question });
    if (node.answer) messages.push({ role: "assistant", content: node.answer });
  }
  return summarizeMessages(messages);
}

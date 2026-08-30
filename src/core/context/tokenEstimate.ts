/**
 * Token 用量估算（近似，用于上下文耗尽提示）
 * 中文/日文/韩文：约 1 字符/token；其他语言：约 4 字符/token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? [])
    .length;
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}

export function estimateMessagesTokens(
  messages: Array<{ content: string }>
): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

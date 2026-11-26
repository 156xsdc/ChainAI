/**
 * 输入法（IME）组字守卫
 *
 * 问题：中文/日文输入法里按回车是「确认候选词」，但 React 的 keydown 同样会收到
 * 这个 Enter，导致拼音还没上屏就把消息发出去了（输入被中断、或者对话框提前提交）。
 *
 * 处理：
 * 1. keydown 事件上的 `isComposing === true` 表示这次按键属于组字过程 → 忽略
 * 2. 兼容 Safari/旧 WebKit：组字中的回车 `keyCode` 固定为 229 → 忽略
 * 3. 少数 WebView 会「先 compositionend 再 keydown」（此时 isComposing 已是 false），
 *    所以再记录组字结束时间，结束后极短窗口内的 Enter 也忽略
 */
import { useCallback, useRef } from "react";

/** 组字结束到 Enter 之间可能的时序差（毫秒），只在这个窗口内补拦 */
const IME_ENTER_GRACE_MS = 40;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** 该 keydown 本身是否发生在组字过程中 */
export function isImeComposingKey(
  e: React.KeyboardEvent | KeyboardEvent
): boolean {
  const native = "nativeEvent" in e ? e.nativeEvent : e;
  if (native && (native as KeyboardEvent).isComposing) return true;
  // Safari/旧 WebKit：组字中的回车 keyCode 为 229
  return e.keyCode === 229;
}

export function useImeComposition() {
  const composing = useRef(false);
  const finishedAt = useRef(0);

  const onCompositionStart = useCallback(() => {
    composing.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composing.current = false;
    finishedAt.current = nowMs();
  }, []);

  /** 挂到 input/textarea 上 */
  const compositionProps = { onCompositionStart, onCompositionEnd };

  /** 这个 Enter 是否应该忽略（组字中 / 刚结束组字） */
  const shouldIgnoreEnter = useCallback((e: React.KeyboardEvent) => {
    if (composing.current || isImeComposingKey(e)) return true;
    return nowMs() - finishedAt.current <= IME_ENTER_GRACE_MS;
  }, []);

  return { compositionProps, shouldIgnoreEnter };
}

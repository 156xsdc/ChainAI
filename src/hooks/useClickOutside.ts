/**
 * 点击外部关闭：给弹出层（下拉菜单/右键菜单等）挂 ref，
 * 点击弹出层以外任意位置时触发 onClose
 * 用 mousedown（早于 click），与 toggle 按钮配合不会互相干扰
 */
import { useEffect, useRef, type RefObject } from "react";

export function useClickOutside<T extends HTMLElement>(
  onClose: () => void,
  enabled = true
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, enabled]);

  return ref;
}

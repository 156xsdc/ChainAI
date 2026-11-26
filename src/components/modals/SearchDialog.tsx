/**
 * 全局搜索（Ctrl+P）：关键词搜索节点，点击跳转
 * 支持 ↑↓ 选择、Enter 跳转、Esc 关闭
 */
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useUIStore } from "../../store/uiStore";
import { Modal } from "../common/Modal";
import type { TreeNode } from "../../core/db";
import { useImeComposition } from "../../hooks/useImeComposition";

function snippet(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

export function SearchDialog() {
  const open = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const repos = useChatStore((s) => s.repos);
  const navigateTo = useChatStore((s) => s.navigateTo);
  const currentTreeId = useChatStore((s) => s.currentTreeId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TreeNode[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // 防抖搜索
  useEffect(() => {
    const q = query.trim();
    if (!q || !repos) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const r = await repos.nodes.search(q, 50, currentTreeId);
      setResults(r);
      setActive(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, repos, currentTreeId]);

  const go = (nodeId: string) => {
    void navigateTo(nodeId);
    setSearchOpen(false);
  };

  const { compositionProps, shouldIgnoreEnter } = useImeComposition();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      // 输入法确认候选词的回车不跳转
      if (shouldIgnoreEnter(e)) return;
      go(results[active].id);
    }
  };

  return (
    <Modal open={open} title="全局搜索" onClose={() => setSearchOpen(false)} width={500}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 focus-within:border-neutral-400">
          <Search size={14} className="shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            {...compositionProps}
            placeholder="搜索对话内容（问题 / 回答 / 摘要）..."
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-300"
          />
        </div>

        <div className="max-h-[360px] min-h-[80px] overflow-y-auto">
          {query.trim() === "" ? (
            <div className="py-6 text-center text-xs text-neutral-300">
              输入关键词开始搜索
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-300">
              未找到匹配内容
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {results.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                    i === active
                      ? "border-neutral-400 bg-neutral-50"
                      : "border-transparent hover:bg-neutral-50"
                  }`}
                >
                  <span className="truncate text-[13px] font-medium text-neutral-800">
                    {n.question || "（无问题）"}
                  </span>
                  {n.answer && (
                    <span className="truncate text-[11px] text-neutral-400">
                      {snippet(n.answer)}
                    </span>
                  )}
                </button>
              ))}
              <div className="pt-1 text-center text-[10px] text-neutral-300">
                ↑↓ 选择 · Enter 跳转 · 共 {results.length} 条
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

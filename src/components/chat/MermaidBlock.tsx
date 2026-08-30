/**
 * Mermaid 图表块：默认显示代码，点击 👁 才渲染为图表
 * 渲染后点击 📝 返回代码视图
 */
import { useRef, useState } from "react";
import { Eye, FileCode2 } from "lucide-react";

export function MermaidBlock({ code }: { code: string }) {
  const [view, setView] = useState<"code" | "graph">("code");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);

  const renderGraph = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      // 动态加载 mermaid（点击时才加载，不增加首屏负担）
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "loose",
        fontFamily: "inherit",
      });
      const result = await mermaid.render(idRef.current, code);
      setSvg(result.svg);
      setView("graph");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (view === "graph") {
    return (
      <div className="relative my-2">
        <div
          className="mermaid-svg overflow-x-auto rounded-xl border border-neutral-100 bg-white p-3"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <button
          className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-500 shadow-sm hover:bg-neutral-50"
          onClick={() => setView("code")}
        >
          <FileCode2 size={11} /> 代码视图
        </button>
      </div>
    );
  }

  return (
    <div className="relative my-2">
      <pre className="!mt-0">
        <code>{code}</code>
      </pre>
      <button
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-400 opacity-0 shadow-sm transition-opacity hover:text-neutral-600 group-hover/msg:opacity-100"
        onClick={() => void renderGraph()}
        title="渲染为图表"
      >
        {loading ? (
          <span className="text-neutral-400">渲染中...</span>
        ) : (
          <>
            <Eye size={11} /> 渲染图表
          </>
        )}
      </button>
      {error && (
        <div className="mt-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] text-red-500">
          渲染失败：{error}
        </div>
      )}
    </div>
  );
}

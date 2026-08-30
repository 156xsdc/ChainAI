/**
 * ECharts 图表块：默认显示代码，点击 👁 渲染（支持完整 ECharts 交互）
 * 代码内容为 ECharts option 对象字面量
 */
import { useEffect, useRef, useState } from "react";
import { Eye, FileCode2 } from "lucide-react";

export function EchartsBlock({ code }: { code: string }) {
  const [view, setView] = useState<"code" | "chart">("code");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ dispose: () => void } | null>(null);

  const renderChart = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      // 动态加载 echarts
      const echarts = await import("echarts");
      // 解析 option（对象字面量）
      const option = new Function(`return (${code});`)();
      if (!containerRef.current) return;
      const chart = echarts.init(containerRef.current);
      chart.setOption(option);
      chartRef.current = chart;
      setView("chart");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // 视图切换/卸载时销毁实例
  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  if (view === "chart") {
    return (
      <div className="relative my-2">
        <div ref={containerRef} className="h-[320px] w-full rounded-xl border border-neutral-100 bg-white" />
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
        onClick={() => void renderChart()}
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
          渲染失败：{error}（代码需为 ECharts option 对象）
        </div>
      )}
    </div>
  );
}

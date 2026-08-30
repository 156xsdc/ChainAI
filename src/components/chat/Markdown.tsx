/**
 * Markdown 渲染：极简黑白灰样式
 * - 支持 GFM（表格、任务列表等）
 * - mermaid 代码块：默认显示代码，点击 👁 渲染
 */
import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";
import { EchartsBlock } from "./EchartsBlock";

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    const lang = match?.[1];
    const content = String(children).replace(/\n$/, "");
    if (lang === "mermaid") {
      return <MermaidBlock code={content} />;
    }
    if (lang === "echarts" || lang === "echart") {
      return <EchartsBlock code={content} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown text-[13.5px] leading-7 text-neutral-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

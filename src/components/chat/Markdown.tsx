/**
 * Markdown 渲染：极简黑白灰样式
 * - 支持 GFM（表格、任务列表等）
 * - mermaid 代码块：默认显示代码，点击 👁 渲染
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    if (match && match[1] === "mermaid") {
      return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown text-[13.5px] leading-7 text-neutral-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

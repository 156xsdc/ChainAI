/**
 * Markdown 渲染：极简黑白灰样式
 * 支持 GFM（表格、任务列表等）；代码块暂用基础样式，高亮后续接入
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown text-[13.5px] leading-7 text-neutral-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

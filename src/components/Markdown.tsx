"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function normalizeMarkdown(markdown: string) {
  return markdown.replace(/<br\s*\/?>/gi, "  \n");
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="loom-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(children)}</ReactMarkdown>
    </div>
  );
}

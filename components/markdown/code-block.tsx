"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { MermaidBlock } from "@/components/markdown/mermaid-block";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}

function languageFromClassName(className?: string): string {
  if (!className) return "";
  const match = /language-([\w+-]+)/.exec(className);
  return match?.[1]?.toLowerCase() ?? "";
}

export function CodeBlock({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const language = languageFromClassName(className);
  const code = extractText(children).replace(/\n$/, "");
  const [copied, setCopied] = useState(false);

  if (language === "mermaid") {
    return <MermaidBlock source={code} />;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="message-md__codeblock">
      <div className="message-md__codeblock-bar">
        <span className="message-md__codeblock-lang">
          {language || "code"}
        </span>
        <button
          type="button"
          className="message-md__codeblock-copy"
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="message-md__pre">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function InlineCode({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <code className={`message-md__inline-code ${className || ""}`} {...props}>
      {children}
    </code>
  );
}

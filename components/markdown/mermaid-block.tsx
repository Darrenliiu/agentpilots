"use client";

import { useEffect, useId, useState } from "react";

export function MermaidBlock({ source }: { source: string }) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const chart = source.trim();
    if (!chart) {
      setFailed(true);
      return;
    }

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "inherit",
        });
        const id = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setSvg(null);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, reactId]);

  if (failed) {
    return (
      <pre className="message-md__pre">
        <code className="language-mermaid">{source}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="message-md__mermaid message-md__mermaid--loading" aria-busy>
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="message-md__mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

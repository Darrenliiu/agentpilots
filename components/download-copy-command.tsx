"use client";

import { useState } from "react";

export function DownloadCopyCommand({
  command,
  label = "Copy",
}: {
  command: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="download-install">
      <div className="download-install__bar">
        <span className="download-install__label">Terminal</span>
        <button
          type="button"
          className="download-install__copy"
          onClick={() => void copy()}
        >
          {copied ? "Copied" : label}
        </button>
      </div>
      <pre className="download-install__pre">
        <code>{command}</code>
      </pre>
    </div>
  );
}

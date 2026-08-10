"use client";

import { useEffect, useState } from "react";
import type { DesktopUpdateStatus } from "@/types/desktop";

export function DesktopUpdateBanner() {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.agentpilots?.updates) return;

    void window.agentpilots.getVersion?.().then(setVersion);
    void window.agentpilots.updates.status().then(setStatus);

    const off = window.agentpilots.updates.onStatus((payload) => {
      setStatus(payload);
      setVisible(true);
    });
    return off;
  }, []);

  if (!visible || !status) return null;
  if (!["available", "downloading", "ready", "error"].includes(status.status)) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border px-4 py-3 shadow-lg md:left-auto"
      style={{
        background: "var(--panel, #fff)",
        borderColor: "var(--line)",
      }}
      role="status"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">
            {status.status === "ready"
              ? `Update ${status.version || ""} ready`
              : status.status === "downloading"
                ? `Downloading update… ${status.percent ?? 0}%`
                : status.status === "available"
                  ? `Update ${status.version || ""} available`
                  : "Desktop update"}
          </div>
          <p className="muted mt-0.5 text-xs">
            {status.message ||
              (version ? `Installed version ${version}` : "AgentPilots Desktop")}
          </p>
          {status.status === "downloading" ? (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full"
              style={{ background: "var(--line)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${status.percent ?? 0}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {status.status === "ready" ? (
            <button
              className="btn"
              type="button"
              onClick={() => void window.agentpilots?.updates.install()}
            >
              Restart
            </button>
          ) : null}
          <button
            className="btn secondary"
            type="button"
            onClick={() => setVisible(false)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

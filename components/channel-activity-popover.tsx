"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";
import {
  elapsedSeconds,
  runStatusLabel,
  type ActiveAgentRun,
} from "@/hooks/use-agent-activity";

function SpinnerIcon() {
  return (
    <svg
      className="agent-activity-spinner"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChannelActivityBadge({
  runs,
  now,
}: {
  runs: ActiveAgentRun[];
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;

    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      setPos({
        top: rect.top,
        left: Math.min(rect.right + 8, window.innerWidth - 280),
      });
    };
    update();

    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!runs.length) return null;

  const oldest = runs.reduce((a, b) =>
    new Date(a.created_at).getTime() <= new Date(b.created_at).getTime() ? a : b,
  );
  const secs = elapsedSeconds(oldest.created_at, now);
  const primaryName = runs[0]?.agent?.name || "Agent";
  const summary =
    runs.length === 1
      ? `${primaryName} working`
      : `${primaryName} and ${runs.length - 1} agent${runs.length - 1 === 1 ? "" : "s"} working`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="channel-activity-badge"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={summary}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {secs}s ({runs.length})
      </button>

      {mounted && open && pos
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-labelledby={titleId}
              className="channel-activity-popover"
              style={{ top: pos.top, left: pos.left }}
            >
              <h3 id={titleId} className="channel-activity-popover__title">
                Channel activity
              </h3>
              <p className="muted mb-2 text-xs">{summary}</p>
              <ul className="space-y-2">
                {runs.map((run) => (
                  <li key={run.id} className="flex items-center gap-2">
                    <Avatar
                      src={run.agent?.avatar_url}
                      name={run.agent?.name || "Agent"}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {run.agent?.name || "Agent"}
                      </div>
                      <div className="muted flex items-center gap-1.5 text-xs">
                        <SpinnerIcon />
                        <span className="min-w-0 truncate">
                          {runStatusLabel(run)}
                        </span>
                      </div>
                    </div>
                    <span className="muted shrink-0 text-xs tabular-nums">
                      {elapsedSeconds(run.created_at, now)}s
                    </span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

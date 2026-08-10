"use client";

import { Avatar } from "@/components/avatar";
import {
  elapsedSeconds,
  runStatusLabel,
  summarizeChannelActivity,
  type ActiveAgentRun,
} from "@/hooks/use-agent-activity";

export function AgentActivityBar({
  runs,
  now,
}: {
  runs: ActiveAgentRun[];
  now: number;
}) {
  if (!runs.length) return null;

  const summary = summarizeChannelActivity(runs);
  if (!summary) return null;

  const visible = runs.slice(0, 3);

  return (
    <div
      className="agent-activity-bar mb-2 flex min-w-0 items-center gap-2 px-0.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex shrink-0 items-center">
        {visible.map((run, i) => (
          <span
            key={run.id}
            className="agent-activity-avatar"
            style={{ marginLeft: i === 0 ? 0 : -6, zIndex: visible.length - i }}
          >
            <Avatar
              src={run.agent?.avatar_url}
              name={run.agent?.name || "Agent"}
              size={18}
              title={run.agent?.name || "Agent"}
            />
          </span>
        ))}
      </div>
      <p className="muted min-w-0 flex-1 truncate text-xs">
        <span className="font-medium" style={{ color: "var(--ink)" }}>
          {summary.extraCount > 0
            ? summary.summary
            : summary.primary.agent?.name || "Agent"}
        </span>
        {summary.extraCount === 0 ? (
          <>
            <span aria-hidden="true">: </span>
            <span>{runStatusLabel(summary.primary)}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true"> · </span>
            <span>{runStatusLabel(summary.primary)}</span>
          </>
        )}
        <span className="tabular-nums">
          {" "}
          · {elapsedSeconds(summary.primary.created_at, now)}s
        </span>
      </p>
    </div>
  );
}

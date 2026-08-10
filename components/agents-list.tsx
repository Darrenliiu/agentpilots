"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { LinkAgentsDialog } from "@/components/link-agents-dialog";
import type { Agent } from "@/lib/types";

type AgentListItem = Pick<
  Agent,
  "id" | "name" | "kind" | "provider" | "model" | "status" | "avatar_url"
> & {
  channelCount: number;
  handoffEnabled?: boolean;
  handoffTo?: Array<{ id: string; name: string }>;
};

export function AgentsList({
  agents,
  communityId,
  communitySlug,
}: {
  agents: AgentListItem[];
  communityId: string;
  communitySlug: string;
}) {
  const [view, setView] = useState<"row" | "grid">("row");
  const [linkOpen, setLinkOpen] = useState(false);
  const base = `/c/${communitySlug}/settings/agents`;
  const canLink = agents.filter((a) => a.kind === "text").length >= 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">
          {agents.length === 0
            ? "No agents yet"
            : `${agents.length} agent${agents.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {agents.length >= 2 ? (
            <button
              type="button"
              className="btn secondary !px-3 !py-1.5 text-sm"
              onClick={() => setLinkOpen(true)}
              disabled={!canLink}
              title={
                canLink
                  ? "Set up hand off between two agents"
                  : "Need two text agents to link"
              }
            >
              Link agents
            </button>
          ) : null}
          <div
            className="inline-flex rounded-full border p-0.5"
            style={{ borderColor: "var(--line)" }}
            role="group"
            aria-label="Layout"
          >
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
              style={
                view === "row"
                  ? { background: "var(--ink)", color: "#fff" }
                  : { color: "var(--ink-muted)" }
              }
              aria-pressed={view === "row"}
              onClick={() => setView("row")}
            >
              <span className="inline-flex items-center gap-1.5">
                <RowsIcon />
                List
              </span>
            </button>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
              style={
                view === "grid"
                  ? { background: "var(--ink)", color: "#fff" }
                  : { color: "var(--ink-muted)" }
              }
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <span className="inline-flex items-center gap-1.5">
                <GridIcon />
                Grid
              </span>
            </button>
          </div>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="panel rounded-2xl px-5 py-10 text-center">
          <p className="brand text-xl">Create your first agent</p>
          <p className="muted mx-auto mt-2 max-w-sm text-sm">
            Connect a model, assign channels, and let members @mention it in chat.
          </p>
          <Link className="btn mt-5" href={`${base}/new`}>
            Create New Agent
          </Link>
        </div>
      ) : view === "row" ? (
        <ul className="panel overflow-hidden rounded-2xl">
          {agents.map((agent, index) => (
            <li
              key={agent.id}
              style={
                index > 0
                  ? { borderTop: "1px solid var(--line)" }
                  : undefined
              }
            >
              <Link
                href={`${base}/${agent.id}`}
                className="nav-hover flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <Avatar src={agent.avatar_url} name={agent.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{agent.name}</div>
                  <div className="muted truncate text-sm">
                    {agent.kind} · {agent.provider} · {agent.model}
                  </div>
                  <HandoffSummary agent={agent} />
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <div className="text-sm font-medium capitalize">{agent.status}</div>
                  <div className="muted text-xs">
                    {agent.channelCount} channel
                    {agent.channelCount === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`${base}/${agent.id}`}
                className="panel nav-hover flex h-full flex-col gap-3 rounded-2xl p-4 transition-colors"
              >
                <Avatar src={agent.avatar_url} name={agent.name} size={48} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{agent.name}</div>
                  <div className="muted mt-1 truncate text-sm">
                    {agent.kind} · {agent.provider}
                  </div>
                  <div className="muted mt-0.5 truncate text-xs">{agent.model}</div>
                  <HandoffSummary agent={agent} />
                </div>
                <div className="muted mt-auto flex items-center justify-between text-xs">
                  <span className="capitalize">{agent.status}</span>
                  <span>
                    {agent.channelCount} channel
                    {agent.channelCount === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <LinkAgentsDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        communityId={communityId}
        agents={agents}
      />
    </div>
  );
}

function HandoffSummary({ agent }: { agent: AgentListItem }) {
  if (!agent.handoffEnabled) return null;
  const names = (agent.handoffTo || []).map((t) => t.name);
  return (
    <div className="muted mt-1 truncate text-xs" style={{ color: "var(--agent)" }}>
      {names.length
        ? `Hands off to ${names.join(", ")}`
        : "Hand Off on · no targets yet"}
    </div>
  );
}

function RowsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 3.5h10M2 7h10M2 10.5h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

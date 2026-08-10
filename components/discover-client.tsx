"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { joinPublicCommunityAction } from "@/lib/actions";
import type { CommunityVisibility } from "@/lib/types";

export type DiscoverMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

export type DiscoverAgent = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export type DiscoverCommunity = {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar_url: string | null;
  visibility: CommunityVisibility;
  memberCount: number;
  agentCount: number;
  isMember: boolean;
  members: DiscoverMember[];
  agents: DiscoverAgent[];
};

type VisibilityFilter = "all" | "public" | "private";

export function DiscoverClient({
  communities,
  isLoggedIn = false,
}: {
  communities: DiscoverCommunity[];
  isLoggedIn?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VisibilityFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return communities.filter((c) => {
      if (filter !== "all" && c.visibility !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
      );
    });
  }, [communities, filter, query]);

  const selected = selectedId
    ? communities.find((c) => c.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="discover-search">
            Search communities
          </label>
          <input
            id="discover-search"
            className="field"
            type="search"
            placeholder="Search communities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div
          className="inline-flex shrink-0 rounded-full border p-0.5"
          style={{ borderColor: "var(--line)" }}
          role="group"
          aria-label="Visibility filter"
        >
          {(
            [
              ["all", "All"],
              ["public", "Public"],
              ["private", "Private"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
              style={
                filter === value
                  ? { background: "var(--ink)", color: "#fff" }
                  : { color: "var(--ink-muted)" }
              }
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel rounded-2xl px-5 py-12 text-center">
          <p className="brand text-xl">No communities found</p>
          <p className="muted mx-auto mt-2 max-w-sm text-sm">
            Try a different search or visibility filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((community) => (
            <button
              key={community.id}
              type="button"
              className="panel rounded-2xl p-5 text-left transition-shadow hover:shadow-md"
              onClick={() => setSelectedId(community.id)}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  src={community.avatar_url}
                  name={community.name}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{community.name}</span>
                    <VisibilityBadge visibility={community.visibility} />
                  </div>
                  <p className="muted mt-1 line-clamp-2 text-sm">
                    {community.description?.trim() || "No description yet."}
                  </p>
                  <p className="muted mt-3 text-xs">
                    {community.memberCount} member
                    {community.memberCount === 1 ? "" : "s"}
                    {" · "}
                    {community.agentCount} agent
                    {community.agentCount === 1 ? "" : "s"}
                    {community.isMember ? " · Joined" : ""}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <CommunityPreviewModal
          community={selected}
          isLoggedIn={isLoggedIn}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function VisibilityBadge({ visibility }: { visibility: CommunityVisibility }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background:
          visibility === "public"
            ? "rgba(15, 118, 110, 0.12)"
            : "rgba(20, 32, 28, 0.08)",
        color: visibility === "public" ? "var(--accent)" : "var(--ink-muted)",
      }}
    >
      {visibility}
    </span>
  );
}

function CommunityPreviewModal({
  community,
  isLoggedIn,
  onClose,
}: {
  community: DiscoverCommunity;
  isLoggedIn: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="panel relative z-10 max-h-[min(90vh,640px)] w-full max-w-lg overflow-auto rounded-2xl p-6 shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-start gap-4">
          <Avatar src={community.avatar_url} name={community.name} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="brand truncate text-2xl">
                {community.name}
              </h2>
              <VisibilityBadge visibility={community.visibility} />
            </div>
            <p className="muted mt-1 text-sm">/{community.slug}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn secondary shrink-0 !px-3 !py-1.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm">
          {community.description?.trim() || "No description yet."}
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="muted mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
              Members ({community.members.length})
            </div>
            {community.members.length === 0 ? (
              <p className="muted text-sm">No members listed.</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-auto">
                {community.members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-2">
                    <Avatar src={m.avatar_url} name={m.display_name} size={28} />
                    <span className="truncate text-sm">{m.display_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="muted mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
              Agents ({community.agents.length})
            </div>
            {community.agents.length === 0 ? (
              <p className="muted text-sm">No agents yet.</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-auto">
                {community.agents.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2"
                    style={{ color: "var(--agent)" }}
                  >
                    <Avatar src={a.avatar_url} name={a.name} size={28} />
                    <span className="truncate text-sm">@{a.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {community.isMember ? (
            <Link className="btn" href={`/c/${community.slug}`}>
              Open community
            </Link>
          ) : community.visibility === "public" ? (
            isLoggedIn ? (
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await joinPublicCommunityAction(community.id);
                    if (res && "error" in res && res.error) setError(res.error);
                  })
                }
              >
                {pending ? "Joining…" : "Join community"}
              </button>
            ) : (
              <Link
                className="btn"
                href={`/login?next=${encodeURIComponent("/discover")}`}
              >
                Log in to join
              </Link>
            )
          ) : (
            <button type="button" className="btn secondary" disabled>
              Invite only
            </button>
          )}
        </div>
        {!community.isMember && community.visibility === "private" ? (
          <p className="muted mt-3 text-sm">
            This community is private. You need an invite link to join.
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import {
  addAgentsToChannelAction,
  addPeopleToChannelAction,
  getOrCreateCommunityShareLinkAction,
} from "@/lib/actions";
import { absoluteShareUrl } from "@/lib/site-url";
import type { AgentKind, AgentStatus } from "@/lib/types";

export type InviteAgentOption = {
  id: string;
  name: string;
  kind: AgentKind;
  status: AgentStatus;
  avatar_url: string | null;
};

export type InvitePersonOption = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type DialogKind = "agents" | "people" | null;

function RobotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="6"
        y="8"
        width="12"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="10" cy="13" r="1.2" fill="currentColor" />
      <circle cx="14" cy="13" r="1.2" fill="currentColor" />
      <path
        d="M9 5.5V8M15 5.5V8M12 3v2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PersonPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 18.5c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M18 9v6M15 12h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L11 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 007.07 7.07L13 19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChannelInviteButtons({
  channelId,
  communityId,
  communitySlug,
  communityAgents,
  linkedAgentIds,
  members,
  channelMemberIds,
  currentUserId,
}: {
  channelId: string;
  communityId: string;
  communitySlug: string;
  communityAgents: InviteAgentOption[];
  linkedAgentIds: string[];
  members: InvitePersonOption[];
  channelMemberIds: string[];
  currentUserId: string;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  const linked = useMemo(() => new Set(linkedAgentIds), [linkedAgentIds]);
  const inChannel = useMemo(() => new Set(channelMemberIds), [channelMemberIds]);

  const availableAgents = useMemo(
    () => communityAgents.filter((a) => !linked.has(a.id)),
    [communityAgents, linked],
  );
  const availablePeople = useMemo(
    () =>
      members.filter((m) => m.id !== currentUserId && !inChannel.has(m.id)),
    [members, currentUserId, inChannel],
  );

  return (
    <>
      <IconButton label="Add agent" onClick={() => setDialog("agents")}>
        <RobotIcon />
      </IconButton>
      <IconButton label="Add people" onClick={() => setDialog("people")}>
        <PersonPlusIcon />
      </IconButton>

      <InvitePickerDialog
        open={dialog === "agents"}
        onClose={() => setDialog(null)}
        title="Add agent"
        description="Add an agent from this community to the channel."
        emptyMessage="All agents are already here."
        options={availableAgents.map((a) => ({
          id: a.id,
          name: a.name,
          avatar_url: a.avatar_url,
          hint: a.status !== "active" ? "disabled" : a.kind,
        }))}
        confirmLabel="Add agents"
        onConfirm={async (ids) => {
          const res = await addAgentsToChannelAction({
            channelId,
            agentIds: ids,
          });
          if (res && "error" in res && res.error) return res.error;
          return null;
        }}
        footer={
          <Link
            href={`/c/${communitySlug}/settings/agents/new`}
            className="btn secondary compact w-full"
            onClick={() => setDialog(null)}
          >
            Create new agent
          </Link>
        }
      />

      <InvitePickerDialog
        open={dialog === "people"}
        onClose={() => setDialog(null)}
        title="Add people"
        description="Invite community members to this channel."
        emptyMessage="Everyone is already in this channel."
        options={availablePeople.map((m) => ({
          id: m.id,
          name: m.display_name,
          avatar_url: m.avatar_url,
        }))}
        confirmLabel="Add people"
        onConfirm={async (ids) => {
          const res = await addPeopleToChannelAction({
            channelId,
            userIds: ids,
          });
          if (res && "error" in res && res.error) return res.error;
          return null;
        }}
        footer={<CommunityShareLink communityId={communityId} />}
      />
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex size-8 items-center justify-center rounded-full transition-colors"
      style={{
        color: "var(--ink)",
        background: "var(--chip-bg)",
        border: "1px solid var(--line)",
      }}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CommunityShareLink({ communityId }: { communityId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function ensureLink(thenCopy: boolean) {
    setError(null);
    start(async () => {
      let url = link;
      if (!url) {
        const res = await getOrCreateCommunityShareLinkAction(communityId);
        if (res && "error" in res && res.error) {
          setError(res.error);
          return;
        }
        if (!("path" in res) || !res.path) {
          setError("Could not create invite link");
          return;
        }
        url = ("url" in res && res.url) || absoluteShareUrl(res.path);
        setLink(url);
      }
      if (thenCopy && url) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setError("Could not copy — select the link instead");
        }
      }
    });
  }

  useEffect(() => {
    ensureLink(false);
    // Load once when the people dialog mounts this footer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  return (
    <div className="w-full space-y-2">
      <p className="muted text-xs font-medium uppercase tracking-[0.08em]">
        Invite to community
      </p>
      <div className="flex items-center gap-2">
        <div
          className="field min-w-0 flex-1 truncate !py-2 font-mono text-xs"
          title={link || undefined}
        >
          {link || (pending ? "Preparing link…" : "—")}
        </div>
        <button
          type="button"
          className="btn secondary compact shrink-0"
          onClick={() => ensureLink(true)}
          disabled={pending}
          title="Copy invite link"
        >
          <LinkIcon />
          {copied ? "Copied" : pending && !link ? "…" : "Copy"}
        </button>
      </div>
      {error ? (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : (
        <p className="muted text-xs">
          Anyone with this link can join until it expires.
        </p>
      )}
    </div>
  );
}

function InvitePickerDialog({
  open,
  onClose,
  title,
  description,
  emptyMessage,
  options,
  confirmLabel,
  onConfirm,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  emptyMessage: string;
  options: { id: string; name: string; avatar_url: string | null; hint?: string }[];
  confirmLabel: string;
  onConfirm: (ids: string[]) => Promise<string | null>;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(new Set());
    setError(null);
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
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  if (!open || !mounted) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    const ids = [...selected];
    if (!ids.length) {
      setError("Select at least one");
      return;
    }
    start(async () => {
      const err = await onConfirm(ids);
      if (err) {
        setError(err);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return createPortal(
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
        className="panel relative z-10 flex max-h-[min(34rem,90vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2 id={titleId} className="brand text-2xl">
              {title}
            </h2>
            <p className="muted mt-1 text-sm">{description}</p>
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

        {options.length === 0 ? (
          <p className="muted px-5 py-6 text-sm">{emptyMessage}</p>
        ) : (
          <>
            <div className="px-5 pt-4">
              <input
                className="field"
                type="search"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
              {filtered.length === 0 ? (
                <li className="muted px-2 py-4 text-center text-sm">
                  No matches
                </li>
              ) : (
                filtered.map((option) => {
                  const checked = selected.has(option.id);
                  return (
                    <li key={option.id}>
                      <label
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2"
                        style={{
                          background: checked ? "var(--chip-bg)" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0"
                          checked={checked}
                          onChange={() => toggle(option.id)}
                        />
                        <Avatar
                          src={option.avatar_url}
                          name={option.name}
                          size={32}
                          title={null}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {option.name}
                          </span>
                          {option.hint ? (
                            <span className="muted text-xs capitalize">
                              {option.hint}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}

        {error ? (
          <p className="px-5 pb-2 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        <div
          className="space-y-3 border-t px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          {options.length > 0 ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn secondary"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={submit}
                disabled={pending || selected.size === 0}
              >
                {pending ? "Adding…" : confirmLabel}
              </button>
            </div>
          ) : null}
          {footer ? <div>{footer}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

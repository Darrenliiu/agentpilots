"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getOrCreateCommunityShareLinkAction,
  regenerateCommunityShareLinkAction,
  updateCommunityShareLinkExpiryAction,
  type ShareLinkExpiryPreset,
} from "@/lib/actions";
import { absoluteShareUrl, publicShareOrigin } from "@/lib/site-url";

const EXPIRY_OPTIONS: { value: ShareLinkExpiryPreset; label: string }[] = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
];

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

function guessPreset(expiresAt: string | null): ShareLinkExpiryPreset {
  if (expiresAt == null) return "never";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "never";
  const day = 24 * 60 * 60 * 1000;
  const days = ms / day;
  if (days <= 1.5) return "1d";
  if (days <= 8) return "7d";
  if (days <= 16) return "14d";
  if (days <= 35) return "30d";
  return "never";
}

function formatExpiry(expiresAt: string | null) {
  if (expiresAt == null) return "Does not expire";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return "Expired";
  }
  return `Expires ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export function CommunityShareLinkPanel({
  communityId,
  initialPath,
  initialExpiresAt,
}: {
  communityId: string;
  initialPath?: string | null;
  initialExpiresAt?: string | null;
}) {
  const router = useRouter();
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(
    initialExpiresAt ?? null,
  );
  const [preset, setPreset] = useState<ShareLinkExpiryPreset>(() =>
    guessPreset(initialExpiresAt ?? null),
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState(() =>
    typeof window !== "undefined" ? publicShareOrigin() : "",
  );

  useEffect(() => {
    setOrigin(publicShareOrigin());
  }, []);

  const absoluteUrl = useMemo(() => {
    if (!path) return null;
    return origin ? `${origin}${path}` : absoluteShareUrl(path);
  }, [origin, path]);

  useEffect(() => {
    if (path) return;
    start(async () => {
      const res = await getOrCreateCommunityShareLinkAction(communityId);
      if (!res || "error" in res) {
        setError(res?.error || "Could not create invite link");
        return;
      }
      setPath(res.path);
      setExpiresAt(res.expiresAt ?? null);
      setPreset(guessPreset(res.expiresAt ?? null));
      setError(null);
    });
  }, [communityId, path]);

  function applyResult(res: {
    path?: string;
    expiresAt?: string | null;
    error?: string;
  }) {
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.path) setPath(res.path);
    if ("expiresAt" in res) setExpiresAt(res.expiresAt ?? null);
    setError(null);
    router.refresh();
  }

  function copyLink() {
    const url = absoluteUrl || (path ? absoluteShareUrl(path) : null);
    if (!url) return;
    start(async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setError("Could not copy — select the link instead");
      }
    });
  }

  function onExpiryChange(next: ShareLinkExpiryPreset) {
    setPreset(next);
    start(async () => {
      const res = await updateCommunityShareLinkExpiryAction(communityId, next);
      applyResult(res);
      if (!("error" in res && res.error) && "expiresAt" in res) {
        setExpiresAt(res.expiresAt ?? null);
      }
    });
  }

  function regenerate() {
    start(async () => {
      const res = await regenerateCommunityShareLinkAction(communityId, preset);
      applyResult(res);
      if (!("error" in res && res.error) && "expiresAt" in res) {
        setExpiresAt(res.expiresAt ?? null);
      }
    });
  }

  return (
    <div className="stack">
      <div>
        <p className="label">Invite URL</p>
        <p className="muted mt-1 text-sm">
          Anyone with this link can join until it expires.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="field min-w-0 flex-1 truncate !py-2.5 font-mono text-xs"
          title={absoluteUrl || path || undefined}
        >
          {absoluteUrl || path || (pending ? "Preparing link…" : "—")}
        </div>
        <button
          type="button"
          className="btn secondary compact shrink-0"
          onClick={copyLink}
          disabled={pending || !path}
          title="Copy invite link"
        >
          <LinkIcon />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[10rem]">
          <label className="label" htmlFor="share-expiry">
            Link expires
          </label>
          <select
            id="share-expiry"
            className="field mt-1"
            value={preset}
            disabled={pending || !path}
            onChange={(e) =>
              onExpiryChange(e.target.value as ShareLinkExpiryPreset)
            }
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="muted mt-1.5 text-xs">{formatExpiry(expiresAt)}</p>
        </div>

        <button
          type="button"
          className="btn secondary compact"
          onClick={regenerate}
          disabled={pending || !path}
        >
          {pending ? "Updating…" : "Regenerate link"}
        </button>
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

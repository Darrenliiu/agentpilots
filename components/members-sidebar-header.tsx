"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getOrCreateCommunityShareLinkAction } from "@/lib/actions";
import { absoluteShareUrl } from "@/lib/site-url";
import {
  SidebarPlusButton,
  SidebarSectionHeader,
} from "@/components/sidebar-section-header";

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

export function MembersSidebarHeader({
  communityId,
}: {
  communityId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SidebarSectionHeader
        label="Members"
        action={
          <SidebarPlusButton
            label="Invite members"
            onClick={() => setOpen(true)}
          />
        }
      />
      <InviteMembersDialog
        open={open}
        onClose={() => setOpen(false)}
        communityId={communityId}
      />
    </>
  );
}

function InviteMembersDialog({
  open,
  onClose,
  communityId,
}: {
  open: boolean;
  onClose: () => void;
  communityId: string;
}) {
  const titleId = useId();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCopied(false);

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

  useEffect(() => {
    if (!open) return;
    if (link) return;
    start(async () => {
      const res = await getOrCreateCommunityShareLinkAction(communityId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      if (!("path" in res) || !res.path) {
        setError("Could not create invite link");
        return;
      }
      setLink(("url" in res && res.url) || absoluteShareUrl(res.path));
    });
  }, [open, communityId, link]);

  if (!open || !mounted) return null;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy — select the link instead");
    }
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
        className="panel relative z-10 w-full max-w-md overflow-hidden rounded-2xl shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2 id={titleId} className="brand text-2xl">
              Invite members
            </h2>
            <p className="muted mt-1 text-sm">
              Share this link so people can join the community.
            </p>
          </div>
          <button
            type="button"
            className="btn secondary shrink-0 !px-3 !py-1.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
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
              onClick={() => void copyLink()}
              disabled={pending || !link}
              title="Copy invite link"
            >
              <LinkIcon />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : (
            <p className="muted text-sm">
              Anyone with this link can join until it expires.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

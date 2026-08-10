"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  deleteChannelAction,
  updateChannelAction,
} from "@/lib/actions";

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconButton({
  label,
  onClick,
  expanded,
  controls,
  children,
}: {
  label: string;
  onClick: () => void;
  expanded?: boolean;
  controls?: string;
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
      aria-expanded={expanded}
      aria-haspopup={controls ? "menu" : undefined}
      aria-controls={controls}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ChannelSettingsButton({
  channelId,
  channelName,
  channelType,
}: {
  channelId: string;
  channelName: string;
  channelType: "public" | "private";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <div className="relative" ref={rootRef}>
        <IconButton
          label="Channel settings"
          expanded={menuOpen}
          controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <SettingsIcon />
        </IconButton>

        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            aria-label="Channel settings"
            className="panel absolute right-0 top-full z-30 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl border py-1 shadow-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <button
              type="button"
              role="menuitem"
              className="nav-hover flex w-full px-3 py-2 text-left text-sm"
              onClick={() => {
                setMenuOpen(false);
                setDialog("edit");
              }}
            >
              Edit channel
            </button>
            <button
              type="button"
              role="menuitem"
              className="nav-hover flex w-full px-3 py-2 text-left text-sm"
              style={{ color: "var(--danger)" }}
              onClick={() => {
                setMenuOpen(false);
                setDialog("delete");
              }}
            >
              Delete channel
            </button>
          </div>
        ) : null}
      </div>

      <EditChannelDialog
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        channelId={channelId}
        channelName={channelName}
        channelType={channelType}
      />
      <DeleteChannelDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        channelId={channelId}
        channelName={channelName}
      />
    </>
  );
}

function EditChannelDialog({
  open,
  onClose,
  channelId,
  channelName,
  channelType,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  channelType: "public" | "private";
}) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [name, setName] = useState(channelName);
  const [type, setType] = useState<"public" | "private">(channelType);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setName(channelName);
    setType(channelType);
    setError(null);
    nameRef.current?.focus();
    nameRef.current?.select();

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
  }, [open, onClose, channelName, channelType]);

  if (!open || !mounted) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const res = await updateChannelAction({
        channelId,
        name,
        type,
      });
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
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
        className="panel relative z-10 w-full max-w-md overflow-hidden rounded-2xl shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2 id={titleId} className="brand text-2xl">
              Edit channel
            </h2>
            <p className="muted mt-1 text-sm">
              Rename this channel or change who can find it.
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

        <form className="stack space-y-4 px-5 py-4" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="edit-channel-name">
              Channel name
            </label>
            <input
              ref={nameRef}
              className="field"
              id="edit-channel-name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ops"
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-channel-type">
              Type
            </label>
            <select
              className="field"
              id="edit-channel-type"
              name="type"
              value={type}
              onChange={(e) =>
                setType(e.target.value === "private" ? "private" : "public")
              }
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function DeleteChannelDialog({
  open,
  onClose,
  channelId,
  channelName,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
}) {
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);

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

  if (!open || !mounted) return null;

  function confirmDelete() {
    setError(null);
    start(async () => {
      const res = await deleteChannelAction(channelId);
      if (res && "error" in res && res.error) {
        setError(res.error);
      }
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
        className="panel relative z-10 w-full max-w-md overflow-hidden rounded-2xl shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 id={titleId} className="brand text-2xl">
            Delete #{channelName}?
          </h2>
          <p className="muted mt-1 text-sm">
            This permanently removes the channel and its messages. This cannot
            be undone.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={pending}
              onClick={confirmDelete}
            >
              {pending ? "Deleting…" : "Delete channel"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import {
  getPresencePreference,
  setPresencePreference,
  subscribePresencePreference,
  type ManualPresenceStatus,
} from "@/lib/presence-preference";

const OPTIONS: { value: ManualPresenceStatus; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "busy", label: "Busy" },
];

export function UserStatusMenu({
  displayName,
  avatarUrl,
  profileHref,
}: {
  displayName: string;
  avatarUrl: string | null;
  profileHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ManualPresenceStatus>("online");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setStatus(getPresencePreference());
    return subscribePresencePreference(setStatus);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const statusLabel = OPTIONS.find((o) => o.value === status)?.label ?? "Online";

  return (
    <div className="relative" ref={rootRef}>
      <div className="nav-hover flex items-center gap-2 rounded-lg px-2 py-1">
        <Link href={profileHref} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="relative shrink-0">
            <Avatar src={avatarUrl} name={displayName} size={24} />
            <span
              className={`presence-dot presence-dot--${status} absolute -left-0.5 -top-0.5`}
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {displayName}
          </span>
        </Link>
        <button
          type="button"
          className="muted flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:text-[var(--ink)]"
          style={{ fontSize: "0.75rem" }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          title="Set status"
          onClick={() => setOpen((value) => !value)}
        >
          <span className={`presence-dot presence-dot--${status}`} aria-hidden="true" />
          <span>{statusLabel}</span>
        </button>
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Set online status"
          className="panel absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-lg border py-1 shadow-sm"
          style={{ borderColor: "var(--line)" }}
        >
          {OPTIONS.map((option) => {
            const selected = option.value === status;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className="nav-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  setPresencePreference(option.value);
                  setStatus(option.value);
                  setOpen(false);
                }}
              >
                <span
                  className={`presence-dot presence-dot--${option.value}`}
                  aria-hidden="true"
                />
                <span className="flex-1">{option.label}</span>
                {selected ? <span className="muted text-xs">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

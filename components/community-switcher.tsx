"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createCommunityAction } from "@/lib/actions";

type CommunityOption = {
  id: string;
  name: string;
  slug: string;
};

function CreateSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn flex-1" type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create"}
    </button>
  );
}

export function CommunitySwitcher({
  current,
  communities,
}: {
  current: CommunityOption;
  communities: CommunityOption[];
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => {
          setOpen((value) => !value);
          if (open) setCreating(false);
        }}
      >
        <span className="brand min-w-0 flex-1 truncate text-base leading-tight">
          {current.name}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 shrink-0 transition-transform duration-150"
          style={{
            color: "var(--ink-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="panel absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl shadow-lg"
          style={{ borderColor: "var(--line)" }}
        >
          {creating ? (
            <form action={createCommunityAction} className="stack p-3">
              <div>
                <label className="label" htmlFor="community-switcher-name">
                  Community name
                </label>
                <input
                  ref={inputRef}
                  className="field"
                  id="community-switcher-name"
                  name="name"
                  required
                  placeholder="Acme Hangar"
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn secondary flex-1"
                  type="button"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <CreateSubmitButton />
              </div>
            </form>
          ) : (
            <>
              <ul className="max-h-64 overflow-auto py-1">
                {communities.map((community) => {
                  const active = community.id === current.id;
                  return (
                    <li key={community.id}>
                      <Link
                        role="menuitem"
                        href={`/c/${community.slug}`}
                        className="nav-hover block truncate px-3 py-2 text-sm font-semibold"
                        style={
                          active
                            ? {
                                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                                color: "var(--accent)",
                              }
                            : undefined
                        }
                        onClick={() => setOpen(false)}
                      >
                        {community.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t p-2" style={{ borderColor: "var(--line)" }}>
                <button
                  type="button"
                  role="menuitem"
                  className="btn secondary w-full"
                  onClick={() => setCreating(true)}
                >
                  Create New Community
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

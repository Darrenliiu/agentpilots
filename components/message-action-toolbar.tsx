"use client";

import { useEffect, useId, useRef, useState } from "react";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉"] as const;

function ReplyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 14L4 9l5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 20v-7a4 4 0 00-4-4H4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function MessageActionToolbar({
  onReact,
  onReply,
  onCopy,
  reactedEmojis,
}: {
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  reactedEmojis: Set<string>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
    <div className="message-action-bar" ref={rootRef}>
      {QUICK_REACTIONS.map((emoji) => {
        const active = reactedEmojis.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            className={`message-action-bar__btn${active ? " message-action-bar__btn--active" : ""}`}
            aria-label={`React with ${emoji}`}
            aria-pressed={active}
            title={emoji}
            onClick={() => onReact(emoji)}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        );
      })}
      <span className="message-action-bar__divider" aria-hidden />
      <button
        type="button"
        className="message-action-bar__btn"
        aria-label="Reply"
        title="Reply"
        onClick={onReply}
      >
        <ReplyIcon />
      </button>
      <div className="relative">
        <button
          type="button"
          className="message-action-bar__btn"
          aria-label="More actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          title="More"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreIcon />
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            className="message-action-bar__menu"
            style={{ borderColor: "var(--line)" }}
          >
            <button
              type="button"
              role="menuitem"
              className="message-action-bar__menu-item"
              onClick={() => {
                onCopy();
                setCopied(true);
                window.setTimeout(() => {
                  setCopied(false);
                  setMenuOpen(false);
                }, 800);
              }}
            >
              {copied ? "Copied" : "Copy message"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export function MessageReactionChips({
  groups,
  onToggle,
}: {
  groups: ReactionGroup[];
  onToggle: (emoji: string) => void;
}) {
  if (!groups.length) return null;

  return (
    <div className="message-reactions" role="list" aria-label="Reactions">
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          role="listitem"
          className={`message-reaction-chip${g.reactedByMe ? " message-reaction-chip--mine" : ""}`}
          aria-pressed={g.reactedByMe}
          aria-label={`${g.emoji} ${g.count}${g.reactedByMe ? ", you reacted" : ""}`}
          onClick={() => onToggle(g.emoji)}
        >
          <span aria-hidden>{g.emoji}</span>
          <span className="message-reaction-chip__count">{g.count}</span>
        </button>
      ))}
    </div>
  );
}

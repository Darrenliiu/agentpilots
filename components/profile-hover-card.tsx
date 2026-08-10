"use client";

import { format } from "date-fns";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";
import { profilePath } from "@/lib/profile-paths";
import {
  MEDIA_PROVIDERS,
  TEXT_PROVIDERS,
  type AgentKind,
  type AgentStatus,
  type CommunityRole,
} from "@/lib/types";

const OPEN_DELAY_MS = 280;
const CLOSE_DELAY_MS = 160;
const CARD_WIDTH = 288;
const VIEWPORT_PAD = 12;

export type AgentHoverInfo = {
  kind: "agent";
  id: string;
  name: string;
  avatarUrl: string | null;
  agentKind: AgentKind | string;
  provider: string;
  model: string;
  status: AgentStatus | string;
  slug?: string | null;
  systemPrompt?: string | null;
};

export type HumanHoverInfo = {
  kind: "human";
  id: string;
  name: string;
  avatarUrl: string | null;
  role?: CommunityRole | string | null;
  joinedAt?: string | null;
};

export type ProfileHoverInfo = AgentHoverInfo | HumanHoverInfo;

type CardPosition = { top: number; left: number; placement: "right" | "left" };

function providerLabel(provider: string) {
  return (
    TEXT_PROVIDERS.find((p) => p.id === provider)?.label ||
    MEDIA_PROVIDERS.find((p) => p.id === provider)?.label ||
    provider
  );
}

function roleLabel(role: string) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function truncate(text: string, max = 140) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function computePosition(trigger: DOMRect): CardPosition {
  const cardHeight = 280;
  const spaceRight = window.innerWidth - trigger.right - VIEWPORT_PAD;
  const placement: "right" | "left" =
    spaceRight >= CARD_WIDTH + 8 || spaceRight >= trigger.left ? "right" : "left";

  let left =
    placement === "right"
      ? trigger.right + 10
      : trigger.left - CARD_WIDTH - 10;
  left = Math.min(
    Math.max(VIEWPORT_PAD, left),
    window.innerWidth - CARD_WIDTH - VIEWPORT_PAD,
  );

  let top = trigger.top;
  top = Math.min(
    Math.max(VIEWPORT_PAD, top),
    window.innerHeight - cardHeight - VIEWPORT_PAD,
  );

  return { top, left, placement };
}

function MessageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7A2.5 2.5 0 0117.5 16H9l-4 3.5V6.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileHoverCard({
  info,
  communitySlug,
  currentUserId,
  children,
  className = "",
}: {
  info: ProfileHoverInfo;
  communitySlug: string;
  currentUserId: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<CardPosition | null>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardId = useId();

  useEffect(() => {
    setMounted(true);
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setPos(computePosition(el.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updatePosition]);

  function clearTimers() {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    openTimer.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, OPEN_DELAY_MS);
  }

  function scheduleClose() {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  const promptPreview =
    info.kind === "agent" && info.systemPrompt
      ? truncate(info.systemPrompt)
      : null;

  const canMessage =
    info.kind === "agent" ||
    (info.kind === "human" && info.id !== currentUserId);

  const href = profilePath(communitySlug, info.kind, info.id);
  const messageHref =
    info.kind === "agent"
      ? `/c/${communitySlug}/dm/agent/${info.id}`
      : `/c/${communitySlug}/dm/${info.id}`;

  return (
    <>
      <Link
        ref={triggerRef}
        href={href}
        className={`profile-hover-trigger ${className}`.trim()}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
        aria-describedby={open ? cardId : undefined}
        aria-label={`View ${info.name}'s profile`}
      >
        {children}
      </Link>
      {mounted && open && pos
        ? createPortal(
            <div
              ref={cardRef}
              id={cardId}
              role="dialog"
              aria-label={`${info.name} profile`}
              className="profile-hover-card"
              style={{ top: pos.top, left: pos.left, width: CARD_WIDTH }}
              data-placement={pos.placement}
              onMouseEnter={() => {
                clearTimers();
                setOpen(true);
              }}
              onMouseLeave={scheduleClose}
            >
              <Link
                href={href}
                className="profile-hover-card__header profile-hover-card__header-link"
                onClick={() => setOpen(false)}
              >
                <Avatar
                  src={info.avatarUrl}
                  name={info.name}
                  size={56}
                  title={null}
                />
                <div className="profile-hover-card__identity">
                  <div className="profile-hover-card__name">{info.name}</div>
                  <div className="profile-hover-card__meta-row">
                    {info.kind === "agent" ? (
                      <span className="agent-badge">Agent</span>
                    ) : (
                      <span className="member-badge">Member</span>
                    )}
                    {info.kind === "agent" ? (
                      <span className="muted text-xs capitalize">
                        {info.agentKind}
                      </span>
                    ) : info.role ? (
                      <span className="muted text-xs">{roleLabel(info.role)}</span>
                    ) : null}
                  </div>
                </div>
              </Link>

              <div className="profile-hover-card__body">
                {info.kind === "agent" ? (
                  <>
                    <div className="profile-hover-card__detail">
                      <span className="profile-hover-card__label">Model</span>
                      <span className="profile-hover-card__value">
                        {providerLabel(info.provider)} · {info.model}
                      </span>
                    </div>
                    <div className="profile-hover-card__detail">
                      <span className="profile-hover-card__label">Status</span>
                      <span className="profile-hover-card__value capitalize">
                        {info.status}
                      </span>
                    </div>
                    {info.slug ? (
                      <div className="profile-hover-card__detail">
                        <span className="profile-hover-card__label">Handle</span>
                        <span className="profile-hover-card__value">
                          @{info.slug}
                        </span>
                      </div>
                    ) : null}
                    {promptPreview ? (
                      <p className="profile-hover-card__prompt">{promptPreview}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    {info.role ? (
                      <div className="profile-hover-card__detail">
                        <span className="profile-hover-card__label">Role</span>
                        <span className="profile-hover-card__value">
                          {roleLabel(info.role)}
                        </span>
                      </div>
                    ) : (
                      <div className="profile-hover-card__detail">
                        <span className="profile-hover-card__label">Type</span>
                        <span className="profile-hover-card__value">
                          Community member
                        </span>
                      </div>
                    )}
                    {info.joinedAt ? (
                      <div className="profile-hover-card__detail">
                        <span className="profile-hover-card__label">Joined</span>
                        <span className="profile-hover-card__value">
                          {format(new Date(info.joinedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="profile-hover-card__actions">
                <Link
                  href={href}
                  className="profile-hover-card__view-btn"
                  onClick={() => setOpen(false)}
                >
                  View profile
                </Link>
                {canMessage ? (
                  <Link
                    href={messageHref}
                    className="profile-hover-card__dm-btn"
                    onClick={() => setOpen(false)}
                  >
                    <MessageIcon />
                    Send Message
                  </Link>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

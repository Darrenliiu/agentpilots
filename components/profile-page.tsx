import { format } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import {
  MEDIA_PROVIDERS,
  TEXT_PROVIDERS,
  type AgentKind,
  type AgentStatus,
  type CommunityRole,
} from "@/lib/types";

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

type Detail = { label: string; value: string };

export function MemberProfilePage({
  communitySlug,
  communityName,
  currentUserId,
  member,
}: {
  communitySlug: string;
  communityName: string;
  currentUserId: string;
  member: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    role: CommunityRole | string;
    joinedAt: string | null;
  };
}) {
  const isSelf = member.id === currentUserId;
  const details: Detail[] = [
    { label: "Role", value: roleLabel(member.role) },
    { label: "Community", value: communityName },
  ];
  if (member.joinedAt) {
    details.push({
      label: "Joined",
      value: format(new Date(member.joinedAt), "MMM d, yyyy"),
    });
  }

  return (
    <ProfileShell
      backHref={`/c/${communitySlug}`}
      avatarUrl={member.avatarUrl}
      name={member.displayName}
      badge={<span className="member-badge">Member</span>}
      subtitle={roleLabel(member.role)}
      details={details}
      actions={
        <>
          {!isSelf ? (
            <Link
              href={`/c/${communitySlug}/dm/${member.id}`}
              className="btn"
            >
              <MessageIcon />
              Send message
            </Link>
          ) : (
            <Link href="/settings/profile" className="btn secondary">
              Edit profile
            </Link>
          )}
        </>
      }
    />
  );
}

export function AgentProfilePage({
  communitySlug,
  communityName,
  canManage,
  agent,
}: {
  communitySlug: string;
  communityName: string;
  canManage: boolean;
  agent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    agentKind: AgentKind | string;
    provider: string;
    model: string;
    status: AgentStatus | string;
    slug: string;
    systemPrompt: string | null;
  };
}) {
  const details: Detail[] = [
    {
      label: "Kind",
      value:
        String(agent.agentKind).charAt(0).toUpperCase() +
        String(agent.agentKind).slice(1),
    },
    {
      label: "Model",
      value: `${providerLabel(agent.provider)} · ${agent.model}`,
    },
    {
      label: "Status",
      value:
        String(agent.status).charAt(0).toUpperCase() +
        String(agent.status).slice(1),
    },
    { label: "Handle", value: `@${agent.slug}` },
    { label: "Community", value: communityName },
  ];

  const prompt = agent.systemPrompt?.trim() || null;

  return (
    <ProfileShell
      backHref={`/c/${communitySlug}`}
      avatarUrl={agent.avatarUrl}
      name={agent.name}
      badge={<span className="agent-badge">Agent</span>}
      subtitle={String(agent.agentKind)}
      nameColor="var(--agent)"
      details={details}
      footer={
        prompt ? (
          <div className="profile-page__prompt">
            <div className="profile-page__prompt-label">System prompt</div>
            <p className="profile-page__prompt-body">{prompt}</p>
          </div>
        ) : null
      }
      actions={
        <>
          <Link
            href={`/c/${communitySlug}/dm/agent/${agent.id}`}
            className="btn"
          >
            <MessageIcon />
            Send message
          </Link>
          {canManage ? (
            <Link
              href={`/c/${communitySlug}/settings/agents/${agent.id}`}
              className="btn secondary"
            >
              Configure
            </Link>
          ) : null}
        </>
      }
    />
  );
}

function ProfileShell({
  backHref,
  avatarUrl,
  name,
  badge,
  subtitle,
  nameColor,
  details,
  actions,
  footer,
}: {
  backHref: string;
  avatarUrl: string | null;
  name: string;
  badge: ReactNode;
  subtitle?: string;
  nameColor?: string;
  details: Detail[];
  actions: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="profile-page">
      <div className="profile-page__inner">
        <Link href={backHref} className="muted text-sm">
          ← Back to community
        </Link>

        <section className="panel profile-page__card">
          <div className="profile-page__header">
            <Avatar src={avatarUrl} name={name} size={88} title={null} />
            <div className="min-w-0 flex-1">
              <div className="profile-page__meta-row">
                {badge}
                {subtitle ? (
                  <span className="muted text-xs capitalize">{subtitle}</span>
                ) : null}
              </div>
              <h1
                className="profile-page__name"
                style={nameColor ? { color: nameColor } : undefined}
              >
                {name}
              </h1>
            </div>
          </div>

          <dl className="profile-page__details">
            {details.map((d) => (
              <div key={d.label} className="profile-page__detail">
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>

          {footer}

          <div className="profile-page__actions">{actions}</div>
        </section>
      </div>
    </main>
  );
}

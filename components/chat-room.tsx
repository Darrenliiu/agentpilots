"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ChannelInviteButtons } from "@/components/channel-invite-buttons";
import {
  ComposerChips,
  ComposerPlusMenu,
  type ComposerAttachment,
} from "@/components/composer-plus-menu";
import {
  MessageBody,
  type MentionTarget,
} from "@/components/message-body";
import {
  ProfileHoverCard,
  type ProfileHoverInfo,
} from "@/components/profile-hover-card";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import { agentProfilePath } from "@/lib/profile-paths";
import { createClient } from "@/lib/supabase/client";
import type {
  Agent,
  CommunityConnector,
  CommunityRole,
  HandoffMetadata,
  Message,
  Profile,
  Skill,
} from "@/lib/types";
import { MEDIA_PROVIDERS, TEXT_PROVIDERS } from "@/lib/types";

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

type RichMessage = Message & {
  author?: Profile | null;
  agent?: Agent | null;
};

type ChatMember = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role?: CommunityRole | null;
  created_at?: string | null;
};

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0014 0M12 18v3M9 21h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseHandoffMetadata(
  metadata: Record<string, unknown> | null | undefined,
): HandoffMetadata | null {
  const raw = metadata?.handoff;
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Partial<HandoffMetadata>;
  if (
    typeof h.from_agent_id !== "string" ||
    !Array.isArray(h.to_agent_ids) ||
    typeof h.depth !== "number"
  ) {
    return null;
  }
  return {
    from_agent_id: h.from_agent_id,
    to_agent_ids: h.to_agent_ids.filter((id): id is string => typeof id === "string"),
    depth: h.depth,
    root_message_id:
      typeof h.root_message_id === "string" ? h.root_message_id : "",
    chain_agent_ids: Array.isArray(h.chain_agent_ids)
      ? h.chain_agent_ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

type MessageTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

function parseTokenUsage(
  metadata: Record<string, unknown> | null | undefined,
): MessageTokenUsage | null {
  const raw = metadata?.usage;
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const inputTokens = typeof u.inputTokens === "number" ? u.inputTokens : null;
  const outputTokens =
    typeof u.outputTokens === "number" ? u.outputTokens : null;
  const totalTokens =
    typeof u.totalTokens === "number"
      ? u.totalTokens
      : inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : null;
  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return null;
  }
  return { inputTokens, outputTokens, totalTokens };
}

function formatTokenCount(n: number) {
  return n.toLocaleString();
}

function TokenUsageLine({ usage }: { usage: MessageTokenUsage }) {
  const total =
    usage.totalTokens ??
    (usage.inputTokens != null && usage.outputTokens != null
      ? usage.inputTokens + usage.outputTokens
      : null);
  if (total == null) return null;

  const detail =
    usage.inputTokens != null && usage.outputTokens != null
      ? `${formatTokenCount(usage.inputTokens)} in · ${formatTokenCount(usage.outputTokens)} out`
      : undefined;

  return (
    <p
      className="muted mt-1.5 text-[0.65rem] tabular-nums tracking-wide"
      title={detail}
    >
      {formatTokenCount(total)} tokens
    </p>
  );
}

function HandoffLine({
  handoff,
  agents,
  communitySlug,
}: {
  handoff: HandoffMetadata;
  agents: Agent[];
  communitySlug: string;
}) {
  const targets = handoff.to_agent_ids
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is Agent => Boolean(a));
  if (!targets.length) return null;

  return (
    <p className="muted mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span>Handed off to</span>
      {targets.map((t, i) => (
        <span key={t.id} className="inline-flex items-center gap-1">
          {i > 0 ? <span>,</span> : null}
          <Link
            href={agentProfilePath(communitySlug, t.id)}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <Avatar src={t.avatar_url} name={t.name} size={16} title={null} />
            <span style={{ color: "var(--agent)" }}>{t.name}</span>
          </Link>
        </span>
      ))}
    </p>
  );
}

function buildMentionTargets(agents: Agent[], members: ChatMember[]): MentionTarget[] {
  const targets: MentionTarget[] = [];

  for (const agent of agents) {
    if (agent.status !== "active") continue;
    const aliases = [agent.name, agent.slug].filter(Boolean);
    targets.push({
      id: `agent:${agent.id}`,
      kind: "agent",
      name: agent.name,
      aliases: [...new Set(aliases)],
      avatar_url: agent.avatar_url,
      hover: hoverInfoFromAgent(agent),
    });
  }

  for (const member of members) {
    if (!member.display_name.trim()) continue;
    targets.push({
      id: `human:${member.id}`,
      kind: "human",
      name: member.display_name,
      aliases: [member.display_name],
      avatar_url: member.avatar_url,
      hover: hoverInfoFromMember(member),
    });
  }

  return targets;
}

function hoverInfoFromAgent(agent: Agent): ProfileHoverInfo {
  return {
    kind: "agent",
    id: agent.id,
    name: agent.name,
    avatarUrl: agent.avatar_url,
    agentKind: agent.kind,
    provider: agent.provider,
    model: agent.model,
    status: agent.status,
    slug: agent.slug,
    systemPrompt: agent.system_prompt,
  };
}

function hoverInfoFromMember(member: ChatMember): ProfileHoverInfo {
  return {
    kind: "human",
    id: member.id,
    name: member.display_name,
    avatarUrl: member.avatar_url,
    role: member.role,
    joinedAt: member.created_at,
  };
}

function hoverInfoFromAuthor(
  author: Profile,
  members: ChatMember[],
): ProfileHoverInfo {
  const member = members.find((m) => m.id === author.id);
  return {
    kind: "human",
    id: author.id,
    name: author.display_name,
    avatarUrl: author.avatar_url,
    role: member?.role,
    joinedAt: member?.created_at ?? author.created_at,
  };
}

function messageHoverInfo(
  message: RichMessage,
  members: ChatMember[],
): ProfileHoverInfo | null {
  if (message.agent) return hoverInfoFromAgent(message.agent);
  if (message.author) return hoverInfoFromAuthor(message.author, members);
  return null;
}

export function ChatRoom({
  channelId,
  channelName,
  channelType = "public",
  communityId,
  communitySlug,
  initialMessages,
  agents,
  communityAgents = [],
  members = [],
  channelMemberIds = [],
  memberCount,
  currentUserId,
  connectors = [],
  skills = [],
  connectedConnectorIds = [],
}: {
  channelId: string;
  channelName: string;
  channelType?: "public" | "private" | "dm";
  communityId: string;
  communitySlug: string;
  initialMessages: RichMessage[];
  agents: Agent[];
  communityAgents?: {
    id: string;
    name: string;
    kind: Agent["kind"];
    status: Agent["status"];
    avatar_url: string | null;
  }[];
  members?: ChatMember[];
  channelMemberIds?: string[];
  memberCount: number;
  currentUserId: string;
  connectors?: CommunityConnector[];
  skills?: Skill[];
  connectedConnectorIds?: string[];
}) {
  const isDm = channelType === "dm";
  const dmAgent = isDm && agents.length > 0 ? agents[0] : null;
  const dmMember =
    isDm && !dmAgent
      ? members.find(
          (m) => channelMemberIds.includes(m.id) && m.id !== currentUserId,
        )
      : null;
  const dmPeer = dmAgent
    ? {
        name: dmAgent.name,
        avatar_url: dmAgent.avatar_url,
        isAgent: true as const,
        detail: [
          dmAgent.slug ? `@${dmAgent.slug}` : "Agent",
          dmAgent.kind.charAt(0).toUpperCase() + dmAgent.kind.slice(1),
          providerLabel(dmAgent.provider),
          dmAgent.model,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : dmMember
      ? {
          name: dmMember.display_name,
          avatar_url: dmMember.avatar_url,
          isAgent: false as const,
          detail: [
            dmMember.role ? roleLabel(dmMember.role) : "Member",
            dmMember.created_at
              ? `Joined ${format(new Date(dmMember.created_at), "MMM yyyy")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : {
          name: channelName,
          avatar_url: null as string | null,
          isAgent: false as const,
          detail: "Direct message",
        };

  const [messages, setMessages] = useState<RichMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment>({
    connectorIds: [],
    skillIds: [],
    imageAgentId: null,
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const mentionTargets = useMemo(
    () => buildMentionTargets(agents, members),
    [agents, members],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`room:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          const enriched: RichMessage = { ...row };
          if (row.author_id) {
            const { data } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", row.author_id)
              .single();
            enriched.author = data;
          }
          if (row.agent_id) {
            const { data } = await supabase
              .from("agents")
              .select("*")
              .eq("id", row.agent_id)
              .single();
            enriched.agent = data;
          }
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, enriched],
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, supabase]);

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionTargets
      .filter((t) =>
        t.aliases.some((alias) => alias.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [mentionQuery, mentionTargets]);

  const onChangeBody = useCallback((value: string) => {
    setBody(value);
    const match = value.match(/(?:^|\s)@([\w-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }, []);

  const {
    supported: speechSupported,
    listening,
    error: speechError,
    toggle: toggleSpeech,
    stop: stopSpeech,
  } = useSpeechDictation({
    value: body,
    onChange: onChangeBody,
  });

  function insertMention(target: MentionTarget) {
    const next = body.replace(/@([\w-]*)$/, `@${target.name} `);
    onChangeBody(next);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    let text = body.trim();
    if (!text || sending) return;
    stopSpeech();
    setSending(true);

    // If an image/video agent was picked via +, ensure it is mentioned
    if (attachments.imageAgentId) {
      const imgAgent = agents.find((a) => a.id === attachments.imageAgentId);
      if (imgAgent && !new RegExp(`@${escapeRegExp(imgAgent.name)}\\b`, "i").test(text)) {
        text = `@${imgAgent.name} ${text}`;
      }
    }

    const mentioned_agent_ids = [
      ...new Set([
        ...agents
          .filter(
            (a) =>
              new RegExp(`@${escapeRegExp(a.name)}\\b`, "i").test(text) ||
              new RegExp(`@${escapeRegExp(a.slug)}\\b`, "i").test(text),
          )
          .map((a) => a.id),
        ...(attachments.imageAgentId ? [attachments.imageAgentId] : []),
        // Agent DMs should always notify the linked agent(s).
        ...(channelType === "dm" ? agents.map((a) => a.id) : []),
      ]),
    ];

    const metadata = {
      mentioned_agent_ids,
      connector_ids: attachments.connectorIds,
      skill_ids: attachments.skillIds,
      ...(attachments.imageAgentId
        ? { image_agent_id: attachments.imageAgentId }
        : {}),
    };

    const { data, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        author_id: currentUserId,
        body: text,
        metadata,
        client_message_id: crypto.randomUUID(),
      })
      .select("*")
      .single();

    setSending(false);
    if (error) {
      alert(error.message);
      return;
    }

    setBody("");
    setMentionQuery(null);
    setAttachments({ connectorIds: [], skillIds: [], imageAgentId: null });

    if (mentioned_agent_ids.length && data) {
      void fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: data.id }),
      });
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header
        className="panel flex items-center justify-between border-b px-5 py-4"
        style={{ borderColor: "var(--line)" }}
      >
        <div>
          {isDm ? (
            <div className="flex items-center gap-3">
              <Avatar
                src={dmPeer.avatar_url}
                name={dmPeer.name}
                size={36}
              />
              <div className="min-w-0">
                <h1
                  className="brand text-2xl leading-tight"
                  style={
                    dmPeer.isAgent ? { color: "var(--agent)" } : undefined
                  }
                >
                  {dmPeer.name}
                </h1>
                <p className="muted mt-0.5 truncate text-sm">{dmPeer.detail}</p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="brand text-2xl"># {channelName}</h1>
              <p className="muted text-sm">
                Use @ to mention agents or members. Agents with Hand Off can
                tag peers to continue the work.
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!isDm ? (
            <>
              <div className="muted flex items-center gap-3 text-sm">
                <span>
                  {memberCount} {memberCount === 1 ? "user" : "users"}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {agents.length} {agents.length === 1 ? "agent" : "agents"}
                </span>
              </div>
              <ChannelInviteButtons
                channelId={channelId}
                communityId={communityId}
                communitySlug={communitySlug}
                communityAgents={communityAgents}
                linkedAgentIds={agents.map((a) => a.id)}
                members={members}
                channelMemberIds={channelMemberIds}
                currentUserId={currentUserId}
              />
            </>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => {
          const name = m.agent?.name || m.author?.display_name || "Unknown";
          const isAgent = Boolean(m.agent_id);
          const avatarUrl = m.agent?.avatar_url || m.author?.avatar_url || null;
          const mediaUrl =
            typeof m.metadata?.media_url === "string" ? m.metadata.media_url : null;
          const handoff = parseHandoffMetadata(m.metadata);
          const tokenUsage = isAgent ? parseTokenUsage(m.metadata) : null;
          const hover = messageHoverInfo(m, members);
          const avatar = (
            <Avatar
              src={avatarUrl}
              name={name}
              size={36}
              className="shrink-0"
              title={null}
            />
          );
          const displayName = (
            <span
              className="font-semibold"
              style={{ color: isAgent ? "var(--agent)" : "var(--ink)" }}
            >
              {name}
            </span>
          );
          return (
            <article key={m.id} className="flex max-w-3xl gap-3">
              {hover ? (
                <ProfileHoverCard
                  info={hover}
                  communitySlug={communitySlug}
                  currentUserId={currentUserId}
                  className="mt-0.5 shrink-0"
                >
                  {avatar}
                </ProfileHoverCard>
              ) : (
                <span className="mt-0.5 shrink-0">{avatar}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {hover ? (
                    <ProfileHoverCard
                      info={hover}
                      communitySlug={communitySlug}
                      currentUserId={currentUserId}
                    >
                      {displayName}
                    </ProfileHoverCard>
                  ) : (
                    displayName
                  )}
                  {isAgent ? <span className="agent-badge">Agent</span> : null}
                  {isAgent && m.agent?.model ? (
                    <span className="muted text-[0.65rem] leading-none">
                      {m.agent.model}
                    </span>
                  ) : null}
                  <span className="muted text-xs">
                    {format(new Date(m.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
                <MessageBody
                  body={m.body}
                  targets={mentionTargets}
                  communitySlug={communitySlug}
                  currentUserId={currentUserId}
                />
                {tokenUsage ? <TokenUsageLine usage={tokenUsage} /> : null}
                {handoff ? (
                  <HandoffLine
                    handoff={handoff}
                    agents={agents}
                    communitySlug={communitySlug}
                  />
                ) : null}
                {mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl}
                    alt="Generated media"
                    className="mt-3 max-h-80 rounded-xl border"
                    style={{ borderColor: "var(--line)" }}
                  />
                ) : null}
              </div>
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="panel relative border-t p-4"
        style={{ borderColor: "var(--line)" }}
      >
        {mentionOptions.length > 0 ? (
          <div
            className="absolute bottom-full left-4 mb-2 w-80 overflow-hidden rounded-xl border shadow-lg"
            style={{
              borderColor: "var(--line)",
              background: "var(--chip-bg)",
              color: "var(--ink)",
            }}
          >
            {mentionOptions.map((t) => (
              <button
                key={t.id}
                type="button"
                className="nav-hover flex w-full items-center gap-2 px-3 py-2 text-left"
                onClick={() => insertMention(t)}
              >
                <Avatar src={t.avatar_url} name={t.name} size={24} />
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                {t.kind === "agent" ? (
                  <span className="agent-badge">Agent</span>
                ) : (
                  <span className="muted text-xs">Member</span>
                )}
              </button>
            ))}
          </div>
        ) : null}
        <ComposerChips
          agents={agents}
          connectors={connectors}
          skills={skills}
          value={attachments}
          onChange={setAttachments}
        />
        <div className="composer-shell">
          <textarea
            placeholder={
              isDm
                ? `Message ${dmPeer.name}`
                : `Message #${channelName}. Use @ to mention agents or people.`
            }
            value={body}
            onChange={(e) => onChangeBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(e);
              }
            }}
          />
          <div className="composer-toolbar">
            <ComposerPlusMenu
              agents={agents}
              connectors={connectors}
              skills={skills}
              connectedConnectorIds={connectedConnectorIds}
              communitySlug={communitySlug}
              value={attachments}
              onChange={setAttachments}
            />
            <div className="composer-toolbar-actions">
              <button
                type="button"
                className={`composer-icon-btn${listening ? " composer-icon-btn--listening" : ""}`}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={listening}
                title={
                  !speechSupported
                    ? "Voice input is not supported in this browser"
                    : speechError
                      ? speechError
                      : listening
                        ? "Listening… click to stop"
                        : "Speak to type"
                }
                disabled={!speechSupported}
                onClick={toggleSpeech}
              >
                <MicIcon />
              </button>
              {body.trim() ? (
                <button
                  className="composer-icon-btn composer-icon-btn--send"
                  disabled={sending}
                  type="submit"
                  aria-label="Send message"
                  title="Send"
                >
                  <SendIcon />
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {speechError && speechSupported ? (
          <p className="muted mt-2 text-xs" role="status">
            {speechError}
          </p>
        ) : null}
      </form>
    </div>
  );
}

import type { ToolSet } from "ai";
import { decryptSecret, encryptSecret } from "@/lib/agents/encrypt";
import {
  extractMentionedAgentIds,
  generateAgentMediaReply,
  generateAgentTextReply,
  getProviderWebSearchTools,
  stripAgentMentions,
} from "@/lib/agents/providers";
import {
  generateAgentCliReply,
  isCliProvider,
} from "@/lib/agents/cli-bridge";
import {
  decryptConnectorToken,
  namespaceTools,
  openConnectorMcpClient,
} from "@/lib/connectors/mcp-client";
import {
  discoverOAuthMetadata,
  mcpClientMetadataUrl,
  refreshAccessToken,
} from "@/lib/connectors/oauth";
import { linkMediaAssetToMessage } from "@/lib/community-media";
import { ensureLocalModelActive } from "@/lib/local-llm";
import { formatSkillsForSystemPrompt } from "@/lib/skills/parse";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentProgressUpdate } from "@/lib/agents/providers";
import type {
  Agent,
  AgentRunPhase,
  CommunityConnector,
  HandoffMetadata,
  Message,
  MessageAttachment,
  Skill,
} from "@/lib/types";

type MessageMeta = {
  mentioned_agent_ids?: string[];
  connector_ids?: string[];
  skill_ids?: string[];
  image_agent_id?: string;
  web_search?: boolean;
  attachments?: MessageAttachment[];
  handoff?: HandoffMetadata;
};

type AdminClient = ReturnType<typeof createAdminClient>;

type ChannelInfo = {
  id: string;
  community_id: string;
  type: string;
};

/** Entry point for human-authored messages (API route). */
export async function runAgentsForMessage(messageId: string) {
  const admin = createAdminClient();

  const { data: message, error: msgErr } = await admin
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (msgErr || !message) throw new Error(msgErr?.message || "Message not found");

  // Human entry only — agent→agent continues in-process after each reply.
  if (message.agent_id) return { ran: 0 };

  const { data: channel } = await admin
    .from("channels")
    .select("id, community_id, type")
    .eq("id", message.channel_id)
    .single();
  if (!channel) throw new Error("Channel not found");

  const agents = await loadChannelAgents(admin, message.channel_id);
  const meta = (message.metadata || {}) as MessageMeta;
  const mentionedIds =
    meta.mentioned_agent_ids || extractMentionedAgentIds(message.body, agents);

  let targets = agents.filter((a) => mentionedIds.includes(a.id));
  if (!targets.length && channel.type === "dm" && agents.length === 1) {
    targets = agents;
  }
  if (!targets.length) return { ran: 0 };

  return runTargetAgents({
    admin,
    message,
    channel: channel as ChannelInfo,
    agents,
    targets,
    meta,
    authorId: message.author_id as string | null,
    handoffIncoming: null,
  });
}

async function runTargetAgents(opts: {
  admin: AdminClient;
  message: Message & { metadata?: MessageMeta };
  channel: ChannelInfo;
  agents: Agent[];
  targets: Agent[];
  meta: MessageMeta;
  authorId: string | null;
  handoffIncoming: HandoffMetadata | null;
}): Promise<{ ran: number }> {
  const { admin, message, channel, agents, targets, meta, authorId } = opts;

  const history = await loadHistory(admin, message.channel_id, message.id);

  let ran = 0;
  for (const agent of targets) {
    const { data: run } = await admin
      .from("agent_runs")
      .insert({
        message_id: message.id,
        agent_id: agent.id,
        channel_id: channel.id,
        community_id: channel.community_id,
        status: "running",
        phase: "thinking",
        status_text: "Thinking…",
      })
      .select("*")
      .single();

    const publishProgress = createRunProgressPublisher(admin, run?.id ?? null);
    const closers: Array<() => Promise<void>> = [];

    try {
      const isLocal = agent.provider === "local";
      const isCli = isCliProvider(agent.provider);
      const { data: secret } = await admin
        .from("agent_secrets")
        .select("*")
        .eq("agent_id", agent.id)
        .maybeSingle();
      if (!isLocal && !isCli && !secret?.encrypted_api_key) {
        throw new Error("No API key configured for this agent");
      }
      const apiKey = isLocal || isCli
        ? isCli
          ? "cli"
          : "local"
        : decryptSecret(secret!.encrypted_api_key);
      const baseUrl = isLocal
        ? secret?.base_url ||
          process.env.LOCAL_LLM_BASE_URL ||
          "http://127.0.0.1:11435/v1"
        : secret?.base_url;
      const prompt =
        stripAgentMentions(message.body, agent) ||
        message.body ||
        (Array.isArray(meta.attachments) && meta.attachments.length
          ? "Please review the attached files."
          : "");

      let body: string;
      let metadata: Record<string, unknown> = {
        agent_id: agent.id,
        provider: agent.provider,
        model: agent.model,
        kind: agent.kind,
      };

      if (opts.handoffIncoming) {
        metadata.handoff_received = {
          from_agent_id: opts.handoffIncoming.from_agent_id,
          depth: opts.handoffIncoming.depth,
          root_message_id: opts.handoffIncoming.root_message_id,
        };
      }

      if (agent.kind === "text") {
        if (isLocal) {
          await ensureLocalModelActive(agent.model || "qwen2.5-1.5b-instruct");
        }

        const { tools: mcpTools, warnings: toolWarnings, skillBlock } =
          await resolveToolsAndSkills({
            admin,
            agent,
            communityId: channel.community_id,
            authorId,
            meta,
            closers,
          });

        const webSearchEnabled = meta.web_search !== false;
        const nativeSearch =
          webSearchEnabled && !isCli
            ? getProviderWebSearchTools(agent.provider)
            : {};
        const tools: ToolSet = { ...mcpTools, ...nativeSearch };

        const systemParts = [
          agent.system_prompt ||
            `You are ${agent.name}, a helpful community agent.`,
        ];

        if (opts.handoffIncoming) {
          const fromName =
            agents.find((a) => a.id === opts.handoffIncoming!.from_agent_id)
              ?.name || "another agent";
          systemParts.push(
            `## Hand off\n\nYou were handed off to by ${fromName}. Continue the work from their last message in this channel. Do not repeat their entire reply unless needed; pick up where they left off.`,
          );
        }

        if (agent.handoff_enabled && agent.handoff_prompt_assist !== false) {
          const assist = await buildHandoffPromptAssist(
            admin,
            agent,
            agents,
          );
          if (assist) systemParts.push(assist);
        }

        if (skillBlock) {
          systemParts.push("## Attached skills\n\n" + skillBlock);
        }

        const attachments = Array.isArray(meta.attachments)
          ? meta.attachments
          : undefined;

        if (isCli) {
          if (Object.keys(tools).length) {
            toolWarnings.push(
              "CLI-linked agents run through the installed CLI; MCP connectors and native web search are skipped.",
            );
          }
          await publishProgress({
            phase: "thinking",
            statusText:
              agent.provider === "claude-cli"
                ? "Running Claude Code CLI…"
                : "Running Codex CLI…",
          });
          const result = await generateAgentCliReply({
            agent,
            systemPrompt: systemParts.join("\n\n"),
            userPrompt: prompt,
            history,
          });
          const allWarnings = [...toolWarnings, ...result.warnings];
          body = result.text;
          if (allWarnings.length) {
            body += `\n\n_${allWarnings.join(" ")}_`;
            metadata.warnings = allWarnings;
          }
          metadata.connection = "cli";
        } else {
          const result = await generateAgentTextReply({
            agent,
            apiKey,
            baseUrl,
            systemPrompt: systemParts.join("\n\n"),
            userPrompt: prompt,
            attachments,
            history,
            tools: Object.keys(tools).length ? tools : undefined,
            onProgress: publishProgress,
          });

          const allWarnings = [...toolWarnings, ...result.warnings];
          body = result.text;
          if (allWarnings.length) {
            body += `\n\n_${allWarnings.join(" ")}_`;
            metadata.warnings = allWarnings;
          }
          if (Object.keys(tools).length) {
            metadata.tools_used = Object.keys(tools);
          }
          if (result.usage) {
            metadata.usage = result.usage;
          }
        }
      } else {
        const generatingLabel =
          agent.kind === "video" ? "Generating video" : "Generating image";
        await publishProgress({
          phase: "generating",
          statusText: generatingLabel,
        });
        const media = await generateAgentMediaReply({
          agent,
          apiKey,
          prompt,
          communityId: channel.community_id,
          channelId: channel.id,
          createdBy: authorId,
          onProgress: publishProgress,
        });
        body = media.body;
        metadata = { ...metadata, ...media.metadata };
      }

      await publishProgress({
        phase: "sending",
        statusText: "Sending message",
      });

      const { data: reply, error: replyErr } = await admin
        .from("messages")
        .insert({
          channel_id: message.channel_id,
          agent_id: agent.id,
          author_id: null,
          body,
          metadata,
        })
        .select("*")
        .single();
      if (replyErr) throw replyErr;

      const assetId =
        typeof metadata.asset_id === "string" ? metadata.asset_id : null;
      if (assetId) {
        await linkMediaAssetToMessage(assetId, reply.id, channel.id);
      }

      if (run) {
        const usage =
          metadata.usage && typeof metadata.usage === "object"
            ? (metadata.usage as {
                inputTokens?: number | null;
                outputTokens?: number | null;
                totalTokens?: number | null;
              })
            : null;
        const inputTokens =
          typeof usage?.inputTokens === "number" ? usage.inputTokens : null;
        const outputTokens =
          typeof usage?.outputTokens === "number" ? usage.outputTokens : null;
        const totalTokens =
          typeof usage?.totalTokens === "number"
            ? usage.totalTokens
            : inputTokens != null && outputTokens != null
              ? inputTokens + outputTokens
              : null;
        await admin
          .from("agent_runs")
          .update({
            status: "succeeded",
            phase: "done",
            status_text: null,
            result_message_id: reply.id,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
          })
          .eq("id", run.id);
      }
      ran += 1;

      const continued = await continueHandoffsFromReply({
        admin,
        reply: reply as Message,
        fromAgent: agent,
        channel,
        agents,
        authorId,
        parentMeta: (message.metadata || {}) as MessageMeta,
        triggerRootMessageId: opts.handoffIncoming?.root_message_id || message.id,
      });
      ran += continued.ran;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Agent run failed";
      if (run) {
        await admin
          .from("agent_runs")
          .update({
            status: "failed",
            phase: "failed",
            status_text: null,
            error,
          })
          .eq("id", run.id);
      }
      await admin.from("messages").insert({
        channel_id: message.channel_id,
        agent_id: agent.id,
        author_id: null,
        body: `⚠️ ${agent.name} failed: ${error}`,
        metadata: { agent_id: agent.id, error: true },
      });
    } finally {
      for (const close of closers) {
        await close();
      }
    }
  }

  return { ran };
}

async function continueHandoffsFromReply(opts: {
  admin: AdminClient;
  reply: Message;
  fromAgent: Agent;
  channel: ChannelInfo;
  agents: Agent[];
  authorId: string | null;
  parentMeta: MessageMeta;
  triggerRootMessageId: string;
}): Promise<{ ran: number }> {
  const { admin, reply, fromAgent, channel, agents, authorId } = opts;

  if (!fromAgent.handoff_enabled) return { ran: 0 };
  if (fromAgent.kind !== "text") return { ran: 0 };

  const { data: allowRows } = await admin
    .from("agent_handoff_targets")
    .select("target_agent_id")
    .eq("agent_id", fromAgent.id);

  const allowIds = new Set(
    (allowRows || []).map((r) => r.target_agent_id as string),
  );
  if (!allowIds.size) return { ran: 0 };

  const mentionedIds = extractMentionedAgentIds(reply.body, agents);
  let targets = agents.filter(
    (a) =>
      a.id !== fromAgent.id &&
      allowIds.has(a.id) &&
      mentionedIds.includes(a.id),
  );
  if (!targets.length) return { ran: 0 };

  const parentHandoff = opts.parentMeta.handoff;
  const prevChain = parentHandoff?.chain_agent_ids || [];
  const chainAgentIds = [...prevChain, fromAgent.id];
  const nextDepth = (parentHandoff?.depth ?? 0) + 1;
  const rootMessageId =
    parentHandoff?.root_message_id || opts.triggerRootMessageId;

  if (
    fromAgent.handoff_max_depth != null &&
    nextDepth > fromAgent.handoff_max_depth
  ) {
    return { ran: 0 };
  }

  if (fromAgent.handoff_block_cycles !== false) {
    targets = targets.filter((a) => !chainAgentIds.includes(a.id));
  }
  if (!targets.length) return { ran: 0 };

  const handoffMeta: HandoffMetadata = {
    from_agent_id: fromAgent.id,
    to_agent_ids: targets.map((t) => t.id),
    depth: nextDepth,
    root_message_id: rootMessageId,
    chain_agent_ids: chainAgentIds,
  };

  await admin
    .from("messages")
    .update({
      metadata: {
        ...(reply.metadata || {}),
        mentioned_agent_ids: targets.map((t) => t.id),
        handoff: handoffMeta,
      },
    })
    .eq("id", reply.id);

  return runTargetAgents({
    admin,
    message: {
      ...reply,
      metadata: {
        ...(reply.metadata || {}),
        mentioned_agent_ids: targets.map((t) => t.id),
        handoff: handoffMeta,
      },
    },
    channel,
    agents,
    targets,
    meta: {
      mentioned_agent_ids: targets.map((t) => t.id),
      handoff: handoffMeta,
    },
    authorId,
    handoffIncoming: handoffMeta,
  });
}

function createRunProgressPublisher(
  admin: AdminClient,
  runId: string | null,
): (update: AgentProgressUpdate) => Promise<void> {
  if (!runId) return async () => {};

  let lastPhase: AgentRunPhase | null = null;
  let lastText: string | null = null;
  let chain: Promise<void> = Promise.resolve();

  return async (update: AgentProgressUpdate) => {
    if (update.phase === lastPhase && update.statusText === lastText) return;
    lastPhase = update.phase;
    lastText = update.statusText;

    chain = chain
      .then(async () => {
        await admin
          .from("agent_runs")
          .update({
            phase: update.phase,
            status_text: update.statusText,
          })
          .eq("id", runId)
          .eq("status", "running");
      })
      .catch(() => {
        // Progress is best-effort; never fail the agent run for UI updates.
      });

    await chain;
  };
}

async function loadChannelAgents(
  admin: AdminClient,
  channelId: string,
): Promise<Agent[]> {
  const { data: channelAgents } = await admin
    .from("agent_channels")
    .select("agent_id, agents(*)")
    .eq("channel_id", channelId);

  return (channelAgents || [])
    .map((row) => row.agents as unknown as Agent)
    .filter((a) => a && a.status === "active");
}

async function loadHistory(
  admin: AdminClient,
  channelId: string,
  excludeMessageId: string,
) {
  const { data: historyRows } = await admin
    .from("messages")
    .select("id, body, author_id, agent_id")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (historyRows || [])
    .reverse()
    .filter((m) => m.id !== excludeMessageId)
    .map((m) => ({
      role: (m.agent_id ? "assistant" : "user") as "assistant" | "user",
      content: m.body as string,
    }));
}

async function buildHandoffPromptAssist(
  admin: AdminClient,
  agent: Agent,
  channelAgents: Agent[],
): Promise<string | null> {
  const { data: allowRows } = await admin
    .from("agent_handoff_targets")
    .select("target_agent_id")
    .eq("agent_id", agent.id);

  const allowIds = new Set(
    (allowRows || []).map((r) => r.target_agent_id as string),
  );
  const peers = channelAgents.filter(
    (a) => a.id !== agent.id && allowIds.has(a.id),
  );
  if (!peers.length) return null;

  const list = peers.map((p) => `- @${p.name}`).join("\n");
  return [
    "## Hand off",
    "When another agent should continue the work, end your reply by tagging exactly one (or more) of these peers with @Name. They will read your message and continue.",
    "Only hand off when it clearly helps; otherwise finish the task yourself.",
    "Allowed hand-off targets:",
    list,
  ].join("\n");
}

async function resolveToolsAndSkills(opts: {
  admin: AdminClient;
  agent: Agent;
  communityId: string;
  authorId: string | null;
  meta: MessageMeta;
  closers: Array<() => Promise<void>>;
}): Promise<{
  tools: ToolSet;
  warnings: string[];
  skillBlock: string;
}> {
  const warnings: string[] = [];
  let tools: ToolSet = {};

  let skillIds = opts.meta.skill_ids || [];
  if (!skillIds.length) {
    const { data: defaults } = await opts.admin
      .from("agent_default_skills")
      .select("skill_id")
      .eq("agent_id", opts.agent.id);
    skillIds = (defaults || []).map((d) => d.skill_id);
  }

  let skills: Skill[] = [];
  if (skillIds.length) {
    const { data } = await opts.admin
      .from("skills")
      .select("*")
      .in("id", skillIds)
      .eq("community_id", opts.communityId)
      .eq("enabled", true);
    skills = (data || []) as Skill[];
  }
  const skillBlock = formatSkillsForSystemPrompt(skills);

  let connectorIds = opts.meta.connector_ids || [];
  if (!connectorIds.length) {
    const { data: defaults } = await opts.admin
      .from("agent_default_connectors")
      .select("community_connector_id")
      .eq("agent_id", opts.agent.id);
    connectorIds = (defaults || []).map((d) => d.community_connector_id);
  }

  if (!connectorIds.length) {
    return { tools, warnings, skillBlock };
  }

  const { data: connectors } = await opts.admin
    .from("community_connectors")
    .select("*")
    .in("id", connectorIds)
    .eq("community_id", opts.communityId)
    .eq("enabled", true);

  for (const connector of (connectors || []) as CommunityConnector[]) {
    try {
      const credential = await resolveConnectorCredential(
        opts.admin,
        connector,
        opts.authorId,
      );
      if (!credential.ok) {
        warnings.push(`${connector.name}: ${credential.reason}`);
        continue;
      }

      const { client, close } = await openConnectorMcpClient(connector, {
        accessToken: credential.accessToken,
      });
      opts.closers.push(close);

      const mcpTools = await client.tools();
      const namespaced = namespaceTools(
        connector.slug,
        mcpTools as Record<string, unknown>,
      ) as ToolSet;
      tools = { ...tools, ...namespaced };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MCP connect failed";
      warnings.push(`${connector.name}: ${msg}`);
    }
  }

  return { tools, warnings, skillBlock };
}

async function resolveConnectorCredential(
  admin: AdminClient,
  connector: CommunityConnector,
  authorId: string | null,
): Promise<
  | { ok: true; accessToken: string | null }
  | { ok: false; reason: string }
> {
  if (connector.auth_type === "none") {
    if (authorId) {
      const { data: personal } = await admin
        .from("user_connector_accounts")
        .select("id, status")
        .eq("community_connector_id", connector.id)
        .eq("user_id", authorId)
        .eq("is_shared", false)
        .maybeSingle();
      if (personal?.status === "connected") {
        return { ok: true, accessToken: null };
      }
    }
    return { ok: true, accessToken: null };
  }

  if (authorId) {
    const { data: personal } = await admin
      .from("user_connector_accounts")
      .select("*")
      .eq("community_connector_id", connector.id)
      .eq("user_id", authorId)
      .eq("is_shared", false)
      .eq("status", "connected")
      .maybeSingle();
    if (personal?.encrypted_access_token) {
      const refreshed = await maybeRefreshConnectorTokens(
        admin,
        connector,
        personal,
      );
      const token = decryptConnectorToken(
        refreshed?.encrypted_access_token || personal.encrypted_access_token,
      );
      if (token) return { ok: true, accessToken: token };
    }
  }

  if (connector.allow_shared_secret) {
    const { data: shared } = await admin
      .from("user_connector_accounts")
      .select("*")
      .eq("community_connector_id", connector.id)
      .eq("is_shared", true)
      .eq("status", "connected")
      .maybeSingle();
    if (shared?.encrypted_access_token) {
      const token = decryptConnectorToken(shared.encrypted_access_token);
      if (token) return { ok: true, accessToken: token };
    }
  }

  return {
    ok: false,
    reason: "not connected (connect in community Connectors settings)",
  };
}

function tokenNeedsRefresh(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return false;
  // Refresh 2 minutes before expiry.
  return ms <= Date.now() + 2 * 60 * 1000;
}

async function maybeRefreshConnectorTokens(
  admin: AdminClient,
  connector: CommunityConnector,
  account: {
    id: string;
    encrypted_access_token?: string | null;
    encrypted_refresh_token?: string | null;
    token_expires_at?: string | null;
    oauth_client_id?: string | null;
    encrypted_oauth_client_secret?: string | null;
    oauth_token_endpoint?: string | null;
    oauth_resource?: string | null;
  },
): Promise<{ encrypted_access_token: string } | null> {
  if (connector.auth_type !== "oauth") return null;
  if (!tokenNeedsRefresh(account.token_expires_at)) return null;
  const refreshToken = decryptConnectorToken(account.encrypted_refresh_token);
  if (!refreshToken) return null;

  let tokenEndpoint = account.oauth_token_endpoint || null;
  let resource = account.oauth_resource || null;
  if (!tokenEndpoint || !resource) {
    const meta = await discoverOAuthMetadata(connector.mcp_url);
    if (!meta) return null;
    tokenEndpoint = tokenEndpoint || meta.token_endpoint;
    resource = resource || meta.resource;
  }

  const slugKey = connector.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const clientId =
    account.oauth_client_id ||
    process.env[`MCP_OAUTH_CLIENT_ID_${slugKey}`] ||
    process.env.MCP_OAUTH_CLIENT_ID ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? mcpClientMetadataUrl(process.env.NEXT_PUBLIC_SITE_URL)
      : null);
  if (!clientId || !tokenEndpoint) return null;

  let clientSecret: string | undefined;
  if (account.encrypted_oauth_client_secret) {
    try {
      clientSecret = decryptSecret(account.encrypted_oauth_client_secret);
    } catch {
      clientSecret = undefined;
    }
  } else {
    clientSecret =
      process.env[`MCP_OAUTH_CLIENT_SECRET_${slugKey}`] ||
      process.env.MCP_OAUTH_CLIENT_SECRET ||
      undefined;
  }

  const tokens = await refreshAccessToken({
    tokenEndpoint,
    refreshToken,
    clientId,
    clientSecret,
    resource: resource || undefined,
  });
  if (!tokens) return null;

  const payload = {
    encrypted_access_token: encryptSecret(tokens.access_token),
    encrypted_refresh_token: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : account.encrypted_refresh_token,
    token_expires_at: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : account.token_expires_at,
    oauth_token_endpoint: tokenEndpoint,
    oauth_resource: resource,
    oauth_client_id: clientId,
    error: null,
  };

  await admin
    .from("user_connector_accounts")
    .update(payload)
    .eq("id", account.id);

  return { encrypted_access_token: payload.encrypted_access_token };
}

export type { Message };

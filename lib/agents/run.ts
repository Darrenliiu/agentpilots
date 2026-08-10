import type { ToolSet } from "ai";
import { decryptSecret } from "@/lib/agents/encrypt";
import {
  extractMentionedAgentIds,
  generateAgentMediaReply,
  generateAgentTextReply,
  stripAgentMentions,
} from "@/lib/agents/providers";
import {
  decryptConnectorToken,
  namespaceTools,
  openConnectorMcpClient,
} from "@/lib/connectors/mcp-client";
import { ensureLocalModelActive } from "@/lib/local-llm";
import { formatSkillsForSystemPrompt } from "@/lib/skills/parse";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Agent,
  CommunityConnector,
  HandoffMetadata,
  Message,
  Skill,
} from "@/lib/types";

type MessageMeta = {
  mentioned_agent_ids?: string[];
  connector_ids?: string[];
  skill_ids?: string[];
  image_agent_id?: string;
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
        status: "running",
      })
      .select("*")
      .single();

    const closers: Array<() => Promise<void>> = [];

    try {
      const isLocal = agent.provider === "local";
      const { data: secret } = await admin
        .from("agent_secrets")
        .select("*")
        .eq("agent_id", agent.id)
        .maybeSingle();
      if (!isLocal && !secret?.encrypted_api_key) {
        throw new Error("No API key configured for this agent");
      }
      const apiKey = isLocal
        ? "local"
        : decryptSecret(secret!.encrypted_api_key);
      const baseUrl = isLocal
        ? secret?.base_url ||
          process.env.LOCAL_LLM_BASE_URL ||
          "http://127.0.0.1:11435/v1"
        : secret?.base_url;
      const prompt = stripAgentMentions(message.body, agent) || message.body;

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

        const { tools, warnings: toolWarnings, skillBlock } =
          await resolveToolsAndSkills({
            admin,
            agent,
            communityId: channel.community_id,
            authorId,
            meta,
            closers,
          });

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

        const result = await generateAgentTextReply({
          agent,
          apiKey,
          baseUrl,
          systemPrompt: systemParts.join("\n\n"),
          userPrompt: prompt,
          history,
          tools: Object.keys(tools).length ? tools : undefined,
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
      } else {
        const media = await generateAgentMediaReply({ agent, apiKey, prompt });
        body = media.body;
        metadata = { ...metadata, ...media.metadata };
      }

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

      if (run) {
        await admin
          .from("agent_runs")
          .update({
            status: "succeeded",
            result_message_id: reply.id,
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
          .update({ status: "failed", error })
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
      const token = decryptConnectorToken(personal.encrypted_access_token);
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

export type { Message };

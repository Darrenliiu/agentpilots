import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgentsList } from "@/components/agents-list";
import { FREE_MAX_AGENTS, isProPlan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import type { Agent } from "@/lib/types";

export default async function AgentsSettingsPage({
  params,
}: {
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: community } = await supabase
    .from("communities")
    .select("*")
    .eq("slug", communitySlug)
    .single();
  if (!community) notFound();

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return (
      <main className="p-8">
        <h1 className="brand text-3xl">Agents</h1>
        <p className="muted mt-3">Only admins can manage agents.</p>
      </main>
    );
  }

  const { data: agents } = await supabase
    .from("agents")
    .select("*")
    .eq("community_id", community.id)
    .order("name");

  const agentIds = (agents || []).map((a) => a.id);
  const { data: links } = agentIds.length
    ? await supabase
        .from("agent_channels")
        .select("agent_id, channel_id")
        .in("agent_id", agentIds)
    : { data: [] as { agent_id: string; channel_id: string }[] };

  const { data: handoffLinks } = agentIds.length
    ? await supabase
        .from("agent_handoff_targets")
        .select("agent_id, target_agent_id")
        .in("agent_id", agentIds)
    : { data: [] as { agent_id: string; target_agent_id: string }[] };

  const channelCountByAgent = new Map<string, number>();
  for (const link of links || []) {
    channelCountByAgent.set(
      link.agent_id,
      (channelCountByAgent.get(link.agent_id) || 0) + 1,
    );
  }

  const agentsById = new Map(
    ((agents || []) as Agent[]).map((a) => [a.id, a]),
  );
  const handoffToByAgent = new Map<string, Array<{ id: string; name: string }>>();
  for (const edge of handoffLinks || []) {
    const target = agentsById.get(edge.target_agent_id);
    if (!target) continue;
    const list = handoffToByAgent.get(edge.agent_id) || [];
    list.push({ id: target.id, name: target.name });
    handoffToByAgent.set(edge.agent_id, list);
  }

  const items = ((agents || []) as Agent[]).map((agent) => ({
    id: agent.id,
    name: agent.name,
    kind: agent.kind,
    provider: agent.provider,
    model: agent.model,
    status: agent.status,
    avatar_url: agent.avatar_url,
    channelCount: channelCountByAgent.get(agent.id) || 0,
    handoffEnabled: Boolean(agent.handoff_enabled),
    handoffTo: handoffToByAgent.get(agent.id) || [],
  }));

  const atFreeAgentCap =
    !isProPlan(community.plan) && items.length >= FREE_MAX_AGENTS;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="brand text-3xl">Agents</h1>
          <p className="muted mt-2 max-w-xl">
            Connect BYO API keys. Members @mention agents in assigned channels to
            prompt them. Use Link agents to set up hand offs between peers.
          </p>
        </div>
        {atFreeAgentCap ? (
          <Link
            className="btn secondary shrink-0"
            href={`/c/${community.slug}/settings/billing`}
          >
            Upgrade for more agents
          </Link>
        ) : (
          <Link
            className="btn shrink-0"
            href={`/c/${community.slug}/settings/agents/new`}
          >
            Create New Agent
          </Link>
        )}
      </div>

      {atFreeAgentCap ? (
        <p className="rounded-xl border px-4 py-3 text-sm">
          Free communities are limited to {FREE_MAX_AGENTS} agents.{" "}
          <Link
            className="underline"
            href={`/c/${community.slug}/settings/billing`}
          >
            Upgrade to Pro
          </Link>{" "}
          for unlimited agents.
        </p>
      ) : null}

      <AgentsList
        agents={items}
        communityId={community.id}
        communitySlug={community.slug}
      />
    </main>
  );
}

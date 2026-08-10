import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgentForm } from "@/components/agent-form";
import { upsertAgentAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Agent, Channel } from "@/lib/types";

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ communitySlug: string; agentId: string }>;
}) {
  const { communitySlug, agentId } = await params;
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
        <h1 className="brand text-3xl">Edit agent</h1>
        <p className="muted mt-3">Only admins can manage agents.</p>
      </main>
    );
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("community_id", community.id)
    .single();
  if (!agent) notFound();

  const { data: channels } = await supabase
    .from("channels")
    .select("*")
    .eq("community_id", community.id)
    .neq("type", "dm")
    .order("name");

  const { data: links } = await supabase
    .from("agent_channels")
    .select("channel_id")
    .eq("agent_id", agent.id);

  const { data: connectors } = await supabase
    .from("community_connectors")
    .select("id, name, enabled")
    .eq("community_id", community.id)
    .order("name");

  const { data: skills } = await supabase
    .from("skills")
    .select("id, name, enabled")
    .eq("community_id", community.id)
    .order("name");

  const { data: defaultConnectors } = await supabase
    .from("agent_default_connectors")
    .select("community_connector_id")
    .eq("agent_id", agent.id);

  const { data: defaultSkills } = await supabase
    .from("agent_default_skills")
    .select("skill_id")
    .eq("agent_id", agent.id);

  const { data: peerAgents } = await supabase
    .from("agents")
    .select("id, name, status")
    .eq("community_id", community.id)
    .neq("id", agent.id)
    .order("name");

  const { data: handoffTargets } = await supabase
    .from("agent_handoff_targets")
    .select("target_agent_id")
    .eq("agent_id", agent.id);

  const agentsHref = `/c/${community.slug}/settings/agents`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link className="muted text-sm hover:underline" href={agentsHref}>
          ← Agents
        </Link>
        <h1 className="brand mt-2 text-3xl">{agent.name}</h1>
        <p className="muted mt-2">
          Update model settings, prompt, status, channel access, and hand off.
        </p>
      </div>

      <section className="panel rounded-2xl p-5">
        <AgentForm
          communityId={community.id}
          channels={(channels || []) as Channel[]}
          agent={agent as Agent}
          selectedChannelIds={(links || []).map((l) => l.channel_id)}
          connectors={connectors || []}
          skills={skills || []}
          selectedConnectorIds={(defaultConnectors || []).map(
            (d) => d.community_connector_id,
          )}
          selectedSkillIds={(defaultSkills || []).map((d) => d.skill_id)}
          peerAgents={peerAgents || []}
          selectedHandoffTargetIds={(handoffTargets || []).map(
            (t) => t.target_agent_id,
          )}
          action={upsertAgentAction}
        />
      </section>
    </main>
  );
}

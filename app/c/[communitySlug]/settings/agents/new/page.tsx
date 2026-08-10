import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgentForm } from "@/components/agent-form";
import { upsertAgentAction } from "@/lib/actions";
import { FREE_MAX_AGENTS, isProPlan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/lib/types";

export default async function NewAgentPage({
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
        <h1 className="brand text-3xl">Create New Agent</h1>
        <p className="muted mt-3">Only admins can manage agents.</p>
      </main>
    );
  }

  const { count: agentCount } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("community_id", community.id);

  if (!isProPlan(community.plan) && (agentCount || 0) >= FREE_MAX_AGENTS) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-8">
        <h1 className="brand text-3xl">Create New Agent</h1>
        <p className="mt-3 rounded-xl border px-4 py-3 text-sm">
          Free communities are limited to {FREE_MAX_AGENTS} agents.{" "}
          <Link
            className="underline"
            href={`/c/${community.slug}/settings/billing`}
          >
            Upgrade to Pro
          </Link>{" "}
          for unlimited agents.
        </p>
        <Link
          className="btn secondary"
          href={`/c/${community.slug}/settings/agents`}
        >
          ← Back to agents
        </Link>
      </main>
    );
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("*")
    .eq("community_id", community.id)
    .neq("type", "dm")
    .order("name");

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

  const { data: peerAgents } = await supabase
    .from("agents")
    .select("id, name, status")
    .eq("community_id", community.id)
    .order("name");

  const agentsHref = `/c/${community.slug}/settings/agents`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link className="muted text-sm hover:underline" href={agentsHref}>
          ← Agents
        </Link>
        <h1 className="brand mt-2 text-3xl">Create New Agent</h1>
        <p className="muted mt-2">
          Add a model, system prompt, and the channels it can join.
        </p>
      </div>

      <section className="panel rounded-2xl p-5">
        <AgentForm
          communityId={community.id}
          channels={(channels || []) as Channel[]}
          connectors={connectors || []}
          skills={skills || []}
          peerAgents={peerAgents || []}
          action={upsertAgentAction}
        />
      </section>
    </main>
  );
}

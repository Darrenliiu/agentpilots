import { notFound, redirect } from "next/navigation";
import { AgentProfilePage } from "@/components/profile-page";
import { createClient } from "@/lib/supabase/server";
import type { AgentKind, AgentStatus, CommunityRole } from "@/lib/types";

export default async function CommunityAgentProfilePage({
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
    .select("id, name, slug")
    .eq("slug", communitySlug)
    .single();
  if (!community) notFound();

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/home");

  const { data: agent } = await supabase
    .from("agents")
    .select(
      "id, name, slug, kind, provider, model, status, avatar_url, system_prompt",
    )
    .eq("community_id", community.id)
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) notFound();

  const role = membership.role as CommunityRole;
  const canManage = role === "owner" || role === "admin";

  return (
    <AgentProfilePage
      communitySlug={community.slug}
      communityName={community.name}
      canManage={canManage}
      agent={{
        id: agent.id,
        name: agent.name,
        avatarUrl: agent.avatar_url,
        agentKind: agent.kind as AgentKind,
        provider: agent.provider,
        model: agent.model,
        status: agent.status as AgentStatus,
        slug: agent.slug,
        systemPrompt: agent.system_prompt,
      }}
    />
  );
}

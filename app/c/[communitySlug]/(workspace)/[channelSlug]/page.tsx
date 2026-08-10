import { notFound, redirect } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { createClient } from "@/lib/supabase/server";
import type {
  Agent,
  CommunityConnector,
  CommunityRole,
  Message,
  Profile,
  Skill,
} from "@/lib/types";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ communitySlug: string; channelSlug: string }>;
}) {
  const { communitySlug, channelSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: community } = await supabase
    .from("communities")
    .select("id, slug")
    .eq("slug", communitySlug)
    .single();
  if (!community) notFound();

  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("community_id", community.id)
    .eq("slug", channelSlug)
    .single();
  if (!channel) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*, author:profiles(*), agent:agents(*)")
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const { data: agentLinks } = await supabase
    .from("agent_channels")
    .select("agents(*)")
    .eq("channel_id", channel.id);

  const { data: channelMemberRows } = await supabase
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", channel.id);

  const channelMemberIds = (channelMemberRows || []).map((row) => row.user_id);
  const memberCount = channelMemberIds.length;

  const { data: communityMembers } = await supabase
    .from("community_members")
    .select("user_id, role, profiles(id, display_name, avatar_url, created_at)")
    .eq("community_id", community.id);

  const { data: communityAgentRows } = await supabase
    .from("agents")
    .select("id, name, kind, status, avatar_url")
    .eq("community_id", community.id)
    .order("name");

  const agents = (agentLinks || [])
    .map((row) => row.agents as unknown as Agent)
    .filter(Boolean);

  const communityAgents = (communityAgentRows || []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as Agent["kind"],
    status: row.status as Agent["status"],
    avatar_url: (row.avatar_url as string | null) ?? null,
  }));

  const members = (communityMembers || [])
    .map((row) => {
      const profile = row.profiles as unknown as {
        id: string;
        display_name: string;
        avatar_url: string | null;
        created_at: string;
      } | null;
      if (!profile) return null;
      return {
        id: profile.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        role: row.role as CommunityRole,
        created_at: profile.created_at,
      };
    })
    .filter(Boolean) as {
    id: string;
    display_name: string;
    avatar_url: string | null;
    role: CommunityRole;
    created_at: string;
  }[];

  const initialMessages = ((messages || []) as unknown as (Message & {
    author: Profile | null;
    agent: Agent | null;
  })[]).map((m) => ({
    ...m,
    metadata: (m.metadata || {}) as Record<string, unknown>,
  }));

  const { data: connectors } = await supabase
    .from("community_connectors")
    .select("*")
    .eq("community_id", community.id)
    .eq("enabled", true)
    .order("name");

  const { data: skills } = await supabase
    .from("skills")
    .select("*")
    .eq("community_id", community.id)
    .eq("enabled", true)
    .order("name");

  const connectorIds = (connectors || []).map((c) => c.id);
  let connectedConnectorIds: string[] = [];
  // None-auth connectors are usable without a personal account
  connectedConnectorIds = (connectors || [])
    .filter((c) => c.auth_type === "none")
    .map((c) => c.id);
  if (connectorIds.length) {
    const { data: accounts } = await supabase
      .from("user_connector_accounts")
      .select("community_connector_id")
      .in("community_connector_id", connectorIds)
      .eq("user_id", user.id)
      .eq("is_shared", false)
      .eq("status", "connected");
    const { data: shared } = await supabase
      .from("user_connector_accounts")
      .select("community_connector_id")
      .in("community_connector_id", connectorIds)
      .eq("is_shared", true)
      .eq("status", "connected");
    connectedConnectorIds = [
      ...new Set([
        ...connectedConnectorIds,
        ...(accounts || []).map((a) => a.community_connector_id),
        ...(shared || []).map((a) => a.community_connector_id),
      ]),
    ];
  }

  return (
    <ChatRoom
      channelId={channel.id}
      channelName={channel.name}
      channelType={channel.type}
      communityId={community.id}
      communitySlug={community.slug}
      initialMessages={initialMessages}
      agents={agents}
      communityAgents={communityAgents}
      members={members}
      channelMemberIds={channelMemberIds}
      memberCount={memberCount}
      currentUserId={user.id}
      connectors={(connectors || []) as CommunityConnector[]}
      skills={(skills || []) as Skill[]}
      connectedConnectorIds={connectedConnectorIds}
    />
  );
}

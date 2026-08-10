import { notFound, redirect } from "next/navigation";
import { ChannelsList } from "@/components/channels-list";
import { createChannelAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/lib/types";

type ProfileAvatar = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type AgentAvatar = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export default async function ChannelsSettingsPage({
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

  const { data: channels } = await supabase
    .from("channels")
    .select("*")
    .eq("community_id", community.id)
    .neq("type", "dm")
    .order("name");

  const channelRows = ((channels || []) as Channel[]).filter(
    (c) => c.type !== "dm",
  );
  const channelIds = channelRows.map((c) => c.id);

  const [{ data: communityMembers }, { data: memberLinks }, { data: agentLinks }] =
    await Promise.all([
      supabase
        .from("community_members")
        .select("user_id, profiles(id, display_name, avatar_url)")
        .eq("community_id", community.id),
      channelIds.length
        ? supabase
            .from("channel_members")
            .select("channel_id, profiles(id, display_name, avatar_url)")
            .in("channel_id", channelIds)
        : Promise.resolve({ data: [] as { channel_id: string; profiles: ProfileAvatar | null }[] }),
      channelIds.length
        ? supabase
            .from("agent_channels")
            .select("channel_id, agents(id, name, avatar_url)")
            .in("channel_id", channelIds)
        : Promise.resolve({ data: [] as { channel_id: string; agents: AgentAvatar | null }[] }),
    ]);

  const communityMemberAvatars = (communityMembers || [])
    .map((row) => {
      const profile = row.profiles as unknown as ProfileAvatar | null;
      if (!profile) return null;
      return {
        id: profile.id,
        name: profile.display_name,
        avatar_url: profile.avatar_url,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    avatar_url: string | null;
  }>;

  const membersByChannel = new Map<
    string,
    Array<{ id: string; name: string; avatar_url: string | null }>
  >();
  for (const row of memberLinks || []) {
    const profile = row.profiles as unknown as ProfileAvatar | null;
    if (!profile) continue;
    const list = membersByChannel.get(row.channel_id) || [];
    list.push({
      id: profile.id,
      name: profile.display_name,
      avatar_url: profile.avatar_url,
    });
    membersByChannel.set(row.channel_id, list);
  }

  const agentsByChannel = new Map<
    string,
    Array<{ id: string; name: string; avatar_url: string | null }>
  >();
  for (const row of agentLinks || []) {
    const agent = row.agents as unknown as AgentAvatar | null;
    if (!agent) continue;
    const list = agentsByChannel.get(row.channel_id) || [];
    list.push({
      id: agent.id,
      name: agent.name,
      avatar_url: agent.avatar_url,
    });
    agentsByChannel.set(row.channel_id, list);
  }

  const items = channelRows.map((channel) => ({
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    type: channel.type,
    members:
      channel.type === "public"
        ? communityMemberAvatars
        : membersByChannel.get(channel.id) || [],
    agents: agentsByChannel.get(channel.id) || [],
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <h1 className="brand text-3xl">Channels</h1>
        <p className="muted mt-2">
          Browse community channels and create a public or private one.
        </p>
      </div>

      <ChannelsList channels={items} communitySlug={community.slug} />

      <section>
        <h2 className="brand text-xl">New channel</h2>
        <p className="muted mt-1 text-sm">
          Create a public or private channel for this community.
        </p>
        <form
          className="panel mt-4 stack rounded-2xl p-5"
          action={createChannelAction.bind(null, community.id)}
        >
          <div>
            <label className="label" htmlFor="name">
              Channel name
            </label>
            <input
              className="field"
              id="name"
              name="name"
              required
              placeholder="ops"
            />
          </div>
          <div>
            <label className="label" htmlFor="type">
              Type
            </label>
            <select className="field" id="type" name="type" defaultValue="public">
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <button className="btn" type="submit">
            Create channel
          </button>
        </form>
      </section>
    </main>
  );
}

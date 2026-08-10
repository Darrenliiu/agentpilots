import { AgentsSidebarList } from "@/components/agents-sidebar-list";
import { ChannelsSidebarList } from "@/components/channels-sidebar-list";
import { CommunitySwitcher } from "@/components/community-switcher";
import { DirectMessagesSidebarList } from "@/components/direct-messages-sidebar-list";
import { MembersList } from "@/components/members-list";
import { MembersSidebarHeader } from "@/components/members-sidebar-header";
import {
  SidebarPlusButton,
  SidebarSectionHeader,
} from "@/components/sidebar-section-header";
import { UserStatusMenu } from "@/components/user-status-menu";
import { isDesktopServer } from "@/lib/desktop";
import { memberProfilePath } from "@/lib/profile-paths";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions";
import type { Channel, Community } from "@/lib/types";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function CommunityWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    .maybeSingle();
  if (!membership) redirect("/home");

  const [
    { data: channels },
    { data: members },
    { data: agents },
    { data: currentProfile },
    { data: memberships },
  ] = await Promise.all([
    supabase.from("channels").select("*").eq("community_id", community.id).order("name"),
    supabase
      .from("community_members")
      .select("user_id, role, profiles(id, display_name, avatar_url)")
      .eq("community_id", community.id),
    supabase
      .from("agents")
      .select("id, name, status, avatar_url")
      .eq("community_id", community.id)
      .eq("status", "active"),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    supabase
      .from("community_members")
      .select("communities(id, name, slug)")
      .eq("user_id", user.id),
  ]);

  const communities =
    memberships
      ?.map((m) => m.communities as unknown as { id: string; name: string; slug: string })
      .filter(Boolean) || [];

  const publicChannels = ((channels || []) as Channel[]).filter((c) => c.type !== "dm");
  const dmChannels = ((channels || []) as Channel[]).filter((c) => c.type === "dm");

  const dmChannelIds = dmChannels.map((ch) => ch.id);
  const [{ data: dmMemberRows }, { data: dmAgentRows }] = dmChannelIds.length
    ? await Promise.all([
        supabase
          .from("channel_members")
          .select("channel_id, user_id")
          .in("channel_id", dmChannelIds),
        supabase
          .from("agent_channels")
          .select("channel_id, agents(id, name, avatar_url)")
          .in("channel_id", dmChannelIds),
      ])
    : [{ data: [] }, { data: [] }];

  const profileById = new Map(
    (members || []).map((m) => {
      const profile = m.profiles as unknown as {
        id: string;
        display_name: string;
        avatar_url: string | null;
      };
      return [profile.id, profile] as const;
    }),
  );

  const dmPeerByChannelId = new Map<
    string,
    { name: string; avatar_url: string | null; isAgent: boolean }
  >();

  for (const row of dmAgentRows || []) {
    const agent = row.agents as unknown as {
      id: string;
      name: string;
      avatar_url: string | null;
    } | null;
    if (!agent) continue;
    dmPeerByChannelId.set(row.channel_id, {
      name: agent.name,
      avatar_url: agent.avatar_url,
      isAgent: true,
    });
  }

  for (const row of dmMemberRows || []) {
    if (dmPeerByChannelId.has(row.channel_id)) continue;
    if (row.user_id === user.id) continue;
    const profile = profileById.get(row.user_id);
    if (!profile) continue;
    dmPeerByChannelId.set(row.channel_id, {
      name: profile.display_name,
      avatar_url: profile.avatar_url,
      isAgent: false,
    });
  }

  const sidebarDms = dmChannels.map((ch) => {
    const peer = dmPeerByChannelId.get(ch.id);
    return {
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
      peerName: peer?.name || ch.name,
      peerAvatarUrl: peer?.avatar_url ?? null,
      isAgent: peer?.isAgent ?? false,
    };
  });

  const peopleOptions = (members || []).map((m) => {
    const profile = m.profiles as unknown as {
      id: string;
      display_name: string;
      avatar_url: string | null;
    };
    return {
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
  });

  const agentOptions = (agents || []).map((a) => ({
    id: a.id,
    name: a.name,
    avatar_url: a.avatar_url,
  }));

  const c = community as Community;

  return (
    <>
      <aside
        className="panel sticky top-0 flex h-screen flex-col overflow-hidden border-r px-3 py-3"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="mb-3.5 shrink-0">
          <CommunitySwitcher
            current={{ id: c.id, name: c.name, slug: c.slug }}
            communities={communities}
          />
        </div>

        <nav className="min-h-0 flex-1 space-y-3.5 overflow-auto">
          <ChannelsSidebarList
            communityId={c.id}
            communitySlug={c.slug}
            channels={publicChannels.map((ch) => ({
              id: ch.id,
              name: ch.name,
              slug: ch.slug,
              type: ch.type,
            }))}
          />

          <DirectMessagesSidebarList
            communityId={c.id}
            communitySlug={c.slug}
            currentUserId={user.id}
            dms={sidebarDms}
            people={peopleOptions}
            agents={agentOptions}
          />

          <div>
            <SidebarSectionHeader
              label="Agents"
              action={
                <SidebarPlusButton
                  label="New agent"
                  href={`/c/${c.slug}/settings/agents/new`}
                />
              }
            />
            <AgentsSidebarList
              communityId={c.id}
              communitySlug={c.slug}
              agents={(agents || []).map((a) => ({
                id: a.id,
                name: a.name,
                avatar_url: a.avatar_url,
                status: a.status,
              }))}
            />
          </div>

          <div>
            <MembersSidebarHeader communityId={c.id} />
            <MembersList
              communityId={c.id}
              communitySlug={c.slug}
              currentUserId={user.id}
              members={(members || []).map((m) => {
                const profile = m.profiles as unknown as {
                  id: string;
                  display_name: string;
                  avatar_url: string | null;
                };
                return {
                  user_id: m.user_id,
                  display_name: profile?.display_name || "Member",
                  avatar_url: profile?.avatar_url ?? null,
                };
              })}
            />
          </div>
        </nav>

        <div
          className="mt-auto shrink-0 space-y-1 border-t pt-2.5"
          style={{ borderColor: "var(--line)" }}
        >
          {!isDesktopServer() ? (
            <Link
              href="/discover"
              className="muted block px-2 py-0.5 text-[11px] hover:text-[var(--ink)]"
            >
              Discover communities
            </Link>
          ) : null}
          <Link
            href={`/c/${c.slug}/settings/invites`}
            className="muted block px-2 py-0.5 text-[11px] hover:text-[var(--ink)]"
          >
            Invite a Friend
          </Link>
          <UserStatusMenu
            displayName={currentProfile?.display_name || "You"}
            avatarUrl={currentProfile?.avatar_url ?? null}
            profileHref={memberProfilePath(c.slug, user.id)}
          />
          <Link className="btn secondary compact w-full" href={`/c/${c.slug}/settings`}>
            Settings
          </Link>
          <form action={signOut}>
            <button className="btn secondary compact w-full" type="submit">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-h-screen overflow-hidden">{children}</div>
    </>
  );
}

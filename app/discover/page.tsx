import Link from "next/link";
import {
  DiscoverClient,
  type DiscoverCommunity,
} from "@/components/discover-client";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import type { CommunityVisibility } from "@/lib/types";

export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: communitiesRaw } = await supabase
    .from("communities")
    .select("id, name, slug, description, avatar_url, visibility, discoverable")
    .eq("discoverable", true)
    .order("name");

  const { data: memberships } = user
    ? await supabase
        .from("community_members")
        .select("community_id")
        .eq("user_id", user.id)
    : { data: [] as { community_id: string }[] };

  const memberCommunityIds = new Set(
    (memberships || []).map((m) => m.community_id as string),
  );

  const communityIds = (communitiesRaw || []).map((c) => c.id as string);

  const { data: allMembers } =
    communityIds.length > 0
      ? await supabase
          .from("community_members")
          .select("community_id, user_id, profiles(id, display_name, avatar_url)")
          .in("community_id", communityIds)
      : { data: [] as never[] };

  const { data: allAgents } =
    communityIds.length > 0
      ? await supabase
          .from("agents")
          .select("id, community_id, name, avatar_url, status")
          .in("community_id", communityIds)
          .eq("status", "active")
      : { data: [] as never[] };

  const membersByCommunity = new Map<
    string,
    DiscoverCommunity["members"]
  >();
  for (const row of allMembers || []) {
    const profile = row.profiles as unknown as {
      id: string;
      display_name: string;
      avatar_url: string | null;
    } | null;
    const list = membersByCommunity.get(row.community_id) || [];
    list.push({
      user_id: row.user_id,
      display_name: profile?.display_name || "Member",
      avatar_url: profile?.avatar_url ?? null,
    });
    membersByCommunity.set(row.community_id, list);
  }

  const agentsByCommunity = new Map<string, DiscoverCommunity["agents"]>();
  for (const row of allAgents || []) {
    const list = agentsByCommunity.get(row.community_id) || [];
    list.push({
      id: row.id,
      name: row.name,
      avatar_url: row.avatar_url,
    });
    agentsByCommunity.set(row.community_id, list);
  }

  const communities: DiscoverCommunity[] = (communitiesRaw || []).map((c) => {
    const members = membersByCommunity.get(c.id) || [];
    const agents = agentsByCommunity.get(c.id) || [];
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || "",
      avatar_url: c.avatar_url,
      visibility: (c.visibility || "private") as CommunityVisibility,
      memberCount: members.length,
      agentCount: agents.length,
      isMember: memberCommunityIds.has(c.id),
      members,
      agents,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="brand text-3xl">
            AgentPilots
          </Link>
          <p className="muted mt-2">
            Browse communities. Join public ones, or get an invite for private.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn secondary" href="/download">
            Download
          </Link>
          {user ? (
            <Link className="btn secondary" href="/home">
              Your communities
            </Link>
          ) : (
            <>
              <Link className="btn secondary" href="/login?next=/discover">
                Log in
              </Link>
              <Link className="btn" href="/signup?next=/discover">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <DiscoverClient communities={communities} isLoggedIn={Boolean(user)} />
      <SiteFooter />
    </main>
  );
}

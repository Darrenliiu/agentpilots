import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CommunityMembersPanel } from "@/components/community-members-panel";
import {
  removeMemberAction,
  updateMemberRoleAction,
} from "@/lib/actions";
import { FREE_MAX_SEATS, isProPlan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import type { CommunityRole } from "@/lib/types";

export default async function MembersSettingsPage({
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
    .select("id, slug, plan")
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

  const currentRole = membership.role as CommunityRole;
  const canInvite = currentRole === "owner" || currentRole === "admin";

  const { data: members } = await supabase
    .from("community_members")
    .select("user_id, role, created_at, profiles(id, display_name, avatar_url)")
    .eq("community_id", community.id)
    .order("created_at", { ascending: true });

  const memberRows = (members || []).map((m) => {
    const profile = m.profiles as unknown as {
      id: string;
      display_name: string;
      avatar_url: string | null;
    };
    return {
      user_id: m.user_id as string,
      role: m.role as CommunityRole,
      joined_at: m.created_at as string,
      profile,
    };
  });

  const seatCount = memberRows.length;
  const atFreeSeatCap =
    !isProPlan(community.plan) && seatCount >= FREE_MAX_SEATS;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="brand text-3xl">Members</h1>
          <p className="muted mt-2">Manage members and community access.</p>
        </div>
        {canInvite ? (
          <Link
            className="btn secondary shrink-0"
            href={`/c/${community.slug}/settings/invites`}
          >
            Invite to community
          </Link>
        ) : null}
      </div>

      {atFreeSeatCap ? (
        <p className="mt-4 rounded-xl border px-4 py-3 text-sm">
          Free communities are limited to {FREE_MAX_SEATS} members.{" "}
          <Link
            className="underline"
            href={`/c/${community.slug}/settings/billing`}
          >
            Upgrade to Pro
          </Link>{" "}
          for more member seats.
        </p>
      ) : null}

      <div className="mt-6">
        <CommunityMembersPanel
          communityId={community.id}
          communitySlug={community.slug}
          members={memberRows}
          currentUserId={user.id}
          currentRole={currentRole}
          updateRoleAction={updateMemberRoleAction}
          removeMemberAction={removeMemberAction}
        />
      </div>
    </main>
  );
}

import { notFound, redirect } from "next/navigation";
import { MemberProfilePage } from "@/components/profile-page";
import { createClient } from "@/lib/supabase/server";
import type { CommunityRole } from "@/lib/types";

export default async function CommunityMemberProfilePage({
  params,
}: {
  params: Promise<{ communitySlug: string; userId: string }>;
}) {
  const { communitySlug, userId } = await params;
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

  const { data: viewerMembership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewerMembership) redirect("/home");

  const { data: membership } = await supabase
    .from("community_members")
    .select("role, created_at, profiles(id, display_name, avatar_url)")
    .eq("community_id", community.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) notFound();

  const profile = membership.profiles as unknown as {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  if (!profile) notFound();

  return (
    <MemberProfilePage
      communitySlug={community.slug}
      communityName={community.name}
      currentUserId={user.id}
      member={{
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        role: membership.role as CommunityRole,
        joinedAt: membership.created_at,
      }}
    />
  );
}

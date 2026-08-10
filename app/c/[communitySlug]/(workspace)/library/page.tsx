import { notFound, redirect } from "next/navigation";
import { CommunityLibrary } from "@/components/community-library";
import type { CommunityMediaAssetRow } from "@/lib/community-media";
import { createClient } from "@/lib/supabase/server";

export default async function CommunityLibraryPage({
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
    .select("id, slug, name")
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

  const [{ data: assets }, { data: agents }] = await Promise.all([
    supabase
      .from("community_media_assets")
      .select(
        "*, agent:agents(id, name, avatar_url), channel:channels(id, slug, name, type)",
      )
      .eq("community_id", community.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("agents")
      .select("id, name")
      .eq("community_id", community.id)
      .order("name"),
  ]);

  const rows = ((assets || []) as unknown as CommunityMediaAssetRow[]).map(
    (row) => ({
      ...row,
      agent: row.agent || null,
      channel: row.channel || null,
    }),
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <CommunityLibrary
        communitySlug={community.slug}
        assets={rows}
        agents={(agents || []).map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}

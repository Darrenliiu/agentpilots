import { CommunityThemeShell } from "@/components/community-theme-shell";
import { getCommunityTheme } from "@/lib/community-themes";
import { createClient } from "@/lib/supabase/server";
import type { Community } from "@/lib/types";
import { notFound, redirect } from "next/navigation";

export default async function CommunityLayout({
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

  const c = community as Community;
  const theme = getCommunityTheme(c.theme);

  return (
    <CommunityThemeShell initialThemeId={theme.id}>{children}</CommunityThemeShell>
  );
}

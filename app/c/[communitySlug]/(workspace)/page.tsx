import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CommunityIndex({
  params,
}: {
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const supabase = await createClient();
  const { data: community } = await supabase
    .from("communities")
    .select("id")
    .eq("slug", communitySlug)
    .single();
  if (!community) redirect("/home");

  const { data: channel } = await supabase
    .from("channels")
    .select("slug")
    .eq("community_id", community.id)
    .eq("slug", "general")
    .maybeSingle();

  redirect(`/c/${communitySlug}/${channel?.slug || "general"}`);
}

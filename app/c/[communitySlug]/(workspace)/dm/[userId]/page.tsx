import { redirect } from "next/navigation";
import { createDmAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DmRedirectPage({
  params,
}: {
  params: Promise<{ communitySlug: string; userId: string }>;
}) {
  const { communitySlug, userId } = await params;
  const supabase = await createClient();
  const { data: community } = await supabase
    .from("communities")
    .select("id")
    .eq("slug", communitySlug)
    .single();
  if (!community) redirect("/home");
  await createDmAction(community.id, userId);
  return null;
}

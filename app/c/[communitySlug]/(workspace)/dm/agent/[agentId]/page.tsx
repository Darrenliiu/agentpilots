import { redirect } from "next/navigation";
import { createAgentDmAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export default async function AgentDmRedirectPage({
  params,
}: {
  params: Promise<{ communitySlug: string; agentId: string }>;
}) {
  const { communitySlug, agentId } = await params;
  const supabase = await createClient();
  const { data: community } = await supabase
    .from("communities")
    .select("id")
    .eq("slug", communitySlug)
    .single();
  if (!community) redirect("/home");
  await createAgentDmAction(community.id, agentId);
  return null;
}

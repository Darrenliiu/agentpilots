import { notFound, redirect } from "next/navigation";
import { CommunityUsagePanel } from "@/components/community-usage-panel";
import { createClient } from "@/lib/supabase/server";
import {
  parseUsageRange,
  rangeStartIso,
  type UsageAgentInfo,
  type UsageRunRow,
} from "@/lib/usage";

export default async function CommunityUsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { communitySlug } = await params;
  const { range: rangeParam } = await searchParams;
  const range = parseUsageRange(rangeParam);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: community } = await supabase
    .from("communities")
    .select("id, slug")
    .eq("slug", communitySlug)
    .single();
  if (!community) notFound();

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return (
      <main className="p-8">
        <h1 className="brand text-3xl">Usage</h1>
        <p className="muted mt-3">Only admins can view usage.</p>
      </main>
    );
  }

  const since = rangeStartIso(90);

  const [{ data: agents }, { data: runs }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name, avatar_url, provider, model, status, kind")
      .eq("community_id", community.id)
      .order("name"),
    supabase
      .from("agent_runs")
      .select(
        "agent_id, status, created_at, input_tokens, output_tokens, total_tokens",
      )
      .eq("community_id", community.id)
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="brand text-3xl">Usage</h1>
        <p className="muted mt-2 max-w-2xl">
          See how your agents are consuming tokens across API and local
          connections — activity timelines and per-agent rollups at a glance.
        </p>
      </div>

      <CommunityUsagePanel
        communitySlug={community.slug}
        agents={(agents || []) as UsageAgentInfo[]}
        runs={(runs || []) as UsageRunRow[]}
        initialRange={range}
      />
    </main>
  );
}

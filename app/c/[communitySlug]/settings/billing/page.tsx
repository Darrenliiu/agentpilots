import { notFound, redirect } from "next/navigation";
import { CommunityBillingPanel } from "@/components/community-billing-panel";
import { createClient } from "@/lib/supabase/server";
import type { CommunityRole } from "@/lib/types";

export default async function CommunityBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { communitySlug } = await params;
  const { checkout } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: community } = await supabase
    .from("communities")
    .select(
      "id, slug, plan, billing_interval, stripe_subscription_status",
    )
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
  const canManage = currentRole === "owner" || currentRole === "admin";

  const [{ count: seatCount }, { count: agentCount }] = await Promise.all([
    supabase
      .from("community_members")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id),
    supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="brand text-3xl">Billing</h1>
      <p className="muted mt-2">
        Free communities include limited seats and agents. Upgrade to Pro for
        25 included member seats, unlimited agents, and higher uploads — with
        extra seats billed only beyond that.
      </p>

      <div className="mt-6">
        <CommunityBillingPanel
          communityId={community.id}
          plan={community.plan ?? "free"}
          billingInterval={community.billing_interval}
          subscriptionStatus={community.stripe_subscription_status}
          seatCount={seatCount || 0}
          agentCount={agentCount || 0}
          canManage={canManage}
          checkoutStatus={checkout ?? null}
        />
      </div>
    </main>
  );
}

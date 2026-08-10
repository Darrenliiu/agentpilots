"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { BillingInterval } from "@/lib/billing";
import {
  FREE_MAX_SEATS,
  extraSeatQuantity,
  subscriptionIsPaid,
} from "@/lib/billing";
import {
  getStripe,
  stripeBasePriceId,
  stripeSeatPriceId,
} from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";

async function requireCommunityAdmin(communityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only admins can manage billing" as const };
  }

  const { data: community } = await supabase
    .from("communities")
    .select(
      "id, slug, name, plan, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, billing_interval, created_by",
    )
    .eq("id", communityId)
    .single();

  if (!community) return { error: "Community not found" as const };

  return { supabase, user, community };
}

export async function createCommunityCheckoutSessionAction(
  communityId: string,
  interval: BillingInterval,
) {
  const access = await requireCommunityAdmin(communityId);
  if ("error" in access) return { error: access.error };

  if (
    access.community.plan === "pro" &&
    subscriptionIsPaid(access.community.stripe_subscription_status)
  ) {
    return { error: "This community is already on Pro. Use Manage billing." };
  }

  const { count } = await access.supabase
    .from("community_members")
    .select("*", { count: "exact", head: true })
    .eq("community_id", communityId);

  const memberCount = Math.max(1, count || 1);
  if (memberCount > FREE_MAX_SEATS && access.community.plan === "free") {
    // Over Free cap after downgrade — still allow upgrade to cover all seats
  }

  const stripe = getStripe();
  const admin = createAdminClient();
  let customerId = access.community.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: access.user.email || undefined,
      name: access.community.name,
      metadata: {
        community_id: communityId,
        created_by: access.user.id,
      },
    });
    customerId = customer.id;
    await admin
      .from("communities")
      .update({ stripe_customer_id: customerId })
      .eq("id", communityId);
  }

  const origin = siteOrigin();
  const billingPath = `${origin}/c/${access.community.slug}/settings/billing`;
  const overage = extraSeatQuantity(memberCount);
  const lineItems: { price: string; quantity: number }[] = [
    { price: stripeBasePriceId(interval), quantity: 1 },
  ];
  if (overage > 0) {
    lineItems.push({
      price: stripeSeatPriceId(interval),
      quantity: overage,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: communityId,
    metadata: { community_id: communityId },
    line_items: lineItems,
    subscription_data: {
      metadata: { community_id: communityId },
    },
    managed_payments: { enabled: true },
    success_url: `${billingPath}?checkout=success`,
    cancel_url: `${billingPath}?checkout=canceled`,
    allow_promotion_codes: true,
  });

  if (!session.url) return { error: "Could not start Checkout" };
  redirect(session.url);
}

export async function createBillingPortalSessionAction(communityId: string) {
  const access = await requireCommunityAdmin(communityId);
  if ("error" in access) return { error: access.error };

  if (!access.community.stripe_customer_id) {
    return { error: "No billing account yet. Upgrade to Pro first." };
  }

  const stripe = getStripe();
  const origin = siteOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: access.community.stripe_customer_id,
    return_url: `${origin}/c/${access.community.slug}/settings/billing`,
  });

  redirect(session.url);
}

export async function revalidateBillingPath(communitySlug: string) {
  revalidatePath(`/c/${communitySlug}/settings/billing`);
}

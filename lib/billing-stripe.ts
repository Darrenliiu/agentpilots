import "server-only";
import type Stripe from "stripe";
import {
  extraSeatQuantity,
  subscriptionIsPaid,
  type BillingInterval,
} from "@/lib/billing";
import {
  getStripe,
  stripeBasePriceId,
  stripeSeatPriceId,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function syncCommunitySeatQuantity(communityId: string) {
  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select(
      "id, stripe_subscription_id, stripe_subscription_status, plan, billing_interval",
    )
    .eq("id", communityId)
    .maybeSingle();

  if (
    !community?.stripe_subscription_id ||
    !subscriptionIsPaid(community.stripe_subscription_status)
  ) {
    return;
  }

  const { count } = await admin
    .from("community_members")
    .select("*", { count: "exact", head: true })
    .eq("community_id", communityId);

  const memberCount = Math.max(1, count || 1);
  const overage = extraSeatQuantity(memberCount);
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    community.stripe_subscription_id,
  );

  const interval: BillingInterval =
    community.billing_interval === "year"
      ? "year"
      : subscription.items.data[0]?.price?.recurring?.interval === "year"
        ? "year"
        : "month";

  const seatPriceId = stripeSeatPriceId(interval);
  const basePriceId = stripeBasePriceId(interval);
  const seatItem = subscription.items.data.find(
    (item) =>
      item.price.id === seatPriceId ||
      item.price.metadata?.kind === "extra_seat",
  );
  const baseItem = subscription.items.data.find(
    (item) => item.price.id === basePriceId,
  );

  // Ensure base stays quantity 1 if present
  if (baseItem && (baseItem.quantity ?? 1) !== 1) {
    await stripe.subscriptions.update(community.stripe_subscription_id, {
      items: [{ id: baseItem.id, quantity: 1 }],
      proration_behavior: "create_prorations",
    });
  }

  if (overage > 0) {
    if (seatItem) {
      if ((seatItem.quantity ?? 0) === overage) return;
      await stripe.subscriptions.update(community.stripe_subscription_id, {
        items: [{ id: seatItem.id, quantity: overage }],
        proration_behavior: "create_prorations",
      });
      return;
    }

    await stripe.subscriptions.update(community.stripe_subscription_id, {
      items: [{ price: seatPriceId, quantity: overage }],
      proration_behavior: "create_prorations",
    });
    return;
  }

  if (seatItem) {
    await stripe.subscriptions.update(community.stripe_subscription_id, {
      items: [{ id: seatItem.id, deleted: true }],
      proration_behavior: "create_prorations",
    });
  }
}

function intervalFromSubscription(
  sub: Stripe.Subscription,
): BillingInterval | null {
  const baseKind = sub.items.data.find(
    (item) => item.price.metadata?.kind === "base",
  );
  const interval =
    baseKind?.price?.recurring?.interval ??
    sub.items.data[0]?.price?.recurring?.interval;
  if (interval === "month") return "month";
  if (interval === "year") return "year";
  return null;
}

export async function applySubscriptionToCommunity(
  communityId: string,
  subscription: Stripe.Subscription,
) {
  const admin = createAdminClient();
  const status = subscription.status;
  const paid = subscriptionIsPaid(status);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  await admin
    .from("communities")
    .update({
      plan: paid ? "pro" : "free",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: status,
      billing_interval: paid ? intervalFromSubscription(subscription) : null,
    })
    .eq("id", communityId);
}

export async function clearCommunityPro(communityId: string, status?: string) {
  const admin = createAdminClient();
  await admin
    .from("communities")
    .update({
      plan: "free",
      stripe_subscription_status: status ?? "canceled",
      billing_interval: null,
    })
    .eq("id", communityId);
}

export function communityIdFromStripeObject(obj: {
  metadata?: Stripe.Metadata | null;
  client_reference_id?: string | null;
}): string | null {
  const fromMeta = obj.metadata?.community_id;
  if (fromMeta) return fromMeta;
  if (obj.client_reference_id) return obj.client_reference_id;
  return null;
}

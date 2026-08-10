import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  applySubscriptionToCommunity,
  clearCommunityPro,
  communityIdFromStripeObject,
} from "@/lib/billing-stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null;
      };
    };
  };
  const ref =
    raw.parent?.subscription_details?.subscription ?? raw.subscription ?? null;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

async function resolveCommunityIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = communityIdFromStripeObject(subscription);
  if (fromMeta) return fromMeta;

  const admin = createAdminClient();
  const { data } = await admin
    .from("communities")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (data?.id) return data.id;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const { data: byCustomer } = await admin
    .from("communities")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return byCustomer?.id ?? null;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const communityId = communityIdFromStripeObject(session);
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!communityId || !subId) break;
        const subscription = await stripe.subscriptions.retrieve(subId);
        await applySubscriptionToCommunity(communityId, subscription);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const communityId =
          await resolveCommunityIdFromSubscription(subscription);
        if (!communityId) break;
        await applySubscriptionToCommunity(communityId, subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const communityId =
          await resolveCommunityIdFromSubscription(subscription);
        if (!communityId) break;
        await clearCommunityPro(communityId, subscription.status);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdFromInvoice(invoice);
        if (!subId) break;
        const subscription = await stripe.subscriptions.retrieve(subId);
        const communityId =
          await resolveCommunityIdFromSubscription(subscription);
        if (!communityId) break;
        await applySubscriptionToCommunity(communityId, subscription);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", err);
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

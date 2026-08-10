import "server-only";
import Stripe from "stripe";
import type { BillingInterval } from "@/lib/billing";

let stripeSingleton: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

export function stripeBasePriceId(interval: BillingInterval) {
  const id =
    interval === "year"
      ? process.env.STRIPE_PRICE_PRO_YEARLY
      : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!id) {
    throw new Error(
      interval === "year"
        ? "Missing STRIPE_PRICE_PRO_YEARLY"
        : "Missing STRIPE_PRICE_PRO_MONTHLY",
    );
  }
  return id;
}

export function stripeSeatPriceId(interval: BillingInterval) {
  const id =
    interval === "year"
      ? process.env.STRIPE_PRICE_PRO_SEAT_YEARLY
      : process.env.STRIPE_PRICE_PRO_SEAT_MONTHLY;
  if (!id) {
    throw new Error(
      interval === "year"
        ? "Missing STRIPE_PRICE_PRO_SEAT_YEARLY"
        : "Missing STRIPE_PRICE_PRO_SEAT_MONTHLY",
    );
  }
  return id;
}

export type CommunityPlan = "free" | "pro";
export type BillingInterval = "month" | "year";

export const FREE_MAX_SEATS = 10;
export const FREE_MAX_AGENTS = 5;

/** Match Supabase Free max file upload. */
export const FREE_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** Practical Pro step-up from Free (chat-sized; not Supabase's 500GB platform max). */
export const PRO_MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024;

export const FREE_MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const PRO_MAX_AVATAR_BYTES = 10 * 1024 * 1024;

/** Member seats included in the Pro base subscription. */
export const PRO_INCLUDED_SEATS = 25;

/** Display prices for Billing UI estimates (actual charge comes from Stripe Price IDs). */
export const PRO_BASE_MONTHLY_USD = 29;
export const PRO_BASE_YEARLY_USD = 290;
export const PRO_EXTRA_SEAT_MONTHLY_USD = 5;
export const PRO_EXTRA_SEAT_YEARLY_USD = 50;

export function isProPlan(plan: string | null | undefined): plan is "pro" {
  return plan === "pro";
}

export function extraSeatQuantity(memberCount: number) {
  return Math.max(0, memberCount - PRO_INCLUDED_SEATS);
}

export function estimateProTotalUsd(
  memberCount: number,
  interval: BillingInterval,
) {
  const base =
    interval === "year" ? PRO_BASE_YEARLY_USD : PRO_BASE_MONTHLY_USD;
  const seatUnit =
    interval === "year"
      ? PRO_EXTRA_SEAT_YEARLY_USD
      : PRO_EXTRA_SEAT_MONTHLY_USD;
  return base + extraSeatQuantity(memberCount) * seatUnit;
}

export function maxAttachmentBytes(plan: string | null | undefined) {
  return isProPlan(plan) ? PRO_MAX_ATTACHMENT_BYTES : FREE_MAX_ATTACHMENT_BYTES;
}

export function maxAvatarBytes(plan: string | null | undefined) {
  return isProPlan(plan) ? PRO_MAX_AVATAR_BYTES : FREE_MAX_AVATAR_BYTES;
}

export function formatBytesLimit(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Math.round(mb)}MB`;
  return `${bytes}B`;
}

export function subscriptionIsPaid(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

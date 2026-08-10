"use client";

import { useState, useTransition } from "react";
import type { BillingInterval } from "@/lib/billing";
import {
  FREE_MAX_AGENTS,
  FREE_MAX_ATTACHMENT_BYTES,
  FREE_MAX_AVATAR_BYTES,
  FREE_MAX_SEATS,
  PRO_BASE_MONTHLY_USD,
  PRO_BASE_YEARLY_USD,
  PRO_EXTRA_SEAT_MONTHLY_USD,
  PRO_EXTRA_SEAT_YEARLY_USD,
  PRO_INCLUDED_SEATS,
  PRO_MAX_ATTACHMENT_BYTES,
  PRO_MAX_AVATAR_BYTES,
  estimateProTotalUsd,
  extraSeatQuantity,
  formatBytesLimit,
  isProPlan,
  subscriptionIsPaid,
} from "@/lib/billing";
import {
  createBillingPortalSessionAction,
  createCommunityCheckoutSessionAction,
} from "@/lib/actions-billing";

export function CommunityBillingPanel({
  communityId,
  plan,
  billingInterval,
  subscriptionStatus,
  seatCount,
  agentCount,
  canManage,
  checkoutStatus,
}: {
  communityId: string;
  plan: string;
  billingInterval: string | null;
  subscriptionStatus: string | null;
  seatCount: number;
  agentCount: number;
  canManage: boolean;
  checkoutStatus?: string | null;
}) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pro = isProPlan(plan) && subscriptionIsPaid(subscriptionStatus);
  const overage = extraSeatQuantity(seatCount);
  const estimate = estimateProTotalUsd(seatCount, interval);

  function upgrade() {
    setError(null);
    startTransition(async () => {
      const result = await createCommunityCheckoutSessionAction(
        communityId,
        interval,
      );
      if (result?.error) setError(result.error);
    });
  }

  function manage() {
    setError(null);
    startTransition(async () => {
      const result = await createBillingPortalSessionAction(communityId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {checkoutStatus === "success" ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          Payment received. Pro unlocks as soon as Stripe confirms the
          subscription (usually a few seconds).
        </p>
      ) : null}
      {checkoutStatus === "canceled" ? (
        <p className="muted rounded-xl border px-4 py-3 text-sm">
          Checkout was canceled. You can upgrade anytime.
        </p>
      ) : null}

      <section className="panel rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="muted text-xs uppercase tracking-wide">Current plan</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {pro ? "Pro Community" : "Free Community"}
            </h2>
            <p className="muted mt-2 text-sm">
              {pro
                ? `Billed ${billingInterval === "year" ? "yearly" : "monthly"} · ${PRO_INCLUDED_SEATS} seats included${
                    overage > 0
                      ? ` · ${overage} extra ${overage === 1 ? "seat" : "seats"}`
                      : ""
                  }`
                : `Up to ${FREE_MAX_SEATS} members and ${FREE_MAX_AGENTS} agents`}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              pro
                ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent)]"
                : "bg-[color-mix(in_oklab,var(--muted)_20%,transparent)]"
            }`}
          >
            {pro ? "Pro" : "Free"}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border px-4 py-3">
            <dt className="muted text-xs uppercase tracking-wide">Members</dt>
            <dd className="mt-1 text-lg font-semibold">
              {seatCount}
              {!pro ? (
                <span className="muted text-sm font-normal">
                  {" "}
                  / {FREE_MAX_SEATS}
                </span>
              ) : (
                <span className="muted text-sm font-normal">
                  {" "}
                  ({PRO_INCLUDED_SEATS} included)
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-xl border px-4 py-3">
            <dt className="muted text-xs uppercase tracking-wide">Agents</dt>
            <dd className="mt-1 text-lg font-semibold">
              {agentCount}
              {!pro ? (
                <span className="muted text-sm font-normal">
                  {" "}
                  / {FREE_MAX_AGENTS}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel rounded-2xl p-5">
        <h3 className="text-lg font-semibold">What you get</h3>
        <ul className="muted mt-3 space-y-2 text-sm">
          <li>
            Free: {FREE_MAX_SEATS} members, {FREE_MAX_AGENTS} agents,{" "}
            {formatBytesLimit(FREE_MAX_ATTACHMENT_BYTES)} attachments,{" "}
            {formatBytesLimit(FREE_MAX_AVATAR_BYTES)} avatars
          </li>
          <li>
            Pro: unlimited agents, {PRO_INCLUDED_SEATS} member seats included,{" "}
            {formatBytesLimit(PRO_MAX_ATTACHMENT_BYTES)} attachments,{" "}
            {formatBytesLimit(PRO_MAX_AVATAR_BYTES)} avatars
          </li>
          <li>
            Pro is ${PRO_BASE_MONTHLY_USD}/month or ${PRO_BASE_YEARLY_USD}/year.
            Extra members beyond {PRO_INCLUDED_SEATS} are $
            {PRO_EXTRA_SEAT_MONTHLY_USD}/seat/month or $
            {PRO_EXTRA_SEAT_YEARLY_USD}/seat/year.
          </li>
        </ul>
      </section>

      {canManage ? (
        <section className="panel rounded-2xl p-5">
          {pro ? (
            <>
              <h3 className="text-lg font-semibold">Manage subscription</h3>
              <p className="muted mt-2 text-sm">
                Update payment method, change billing interval, or cancel in the
                Stripe Customer Portal. Extra seats update automatically when
                members join or leave.
              </p>
              <button
                type="button"
                className="btn mt-4"
                disabled={pending}
                onClick={manage}
              >
                {pending ? "Opening…" : "Manage billing"}
              </button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold">Upgrade to Pro</h3>
              <p className="muted mt-2 text-sm">
                Choose monthly or yearly (yearly saves ~17%). You&apos;ll pay the
                Pro base
                {overage > 0
                  ? ` plus ${overage} extra ${overage === 1 ? "seat" : "seats"}`
                  : ""}
                ; seat quantity updates when members join or leave past{" "}
                {PRO_INCLUDED_SEATS}.
              </p>

              <div
                className="mt-4 flex flex-wrap gap-2"
                role="group"
                aria-label="Billing interval"
              >
                <button
                  type="button"
                  className={`btn ${interval === "month" ? "" : "secondary"}`}
                  onClick={() => setInterval("month")}
                >
                  Monthly · ${PRO_BASE_MONTHLY_USD}
                </button>
                <button
                  type="button"
                  className={`btn ${interval === "year" ? "" : "secondary"}`}
                  onClick={() => setInterval("year")}
                >
                  Yearly · ${PRO_BASE_YEARLY_USD}
                </button>
              </div>

              <p className="mt-4 text-sm">
                Estimated total:{" "}
                <strong>
                  ${estimate}
                  {interval === "year" ? "/year" : "/month"}
                </strong>
                {overage > 0 ? (
                  <span className="muted">
                    {" "}
                    (base + {overage} × $
                    {interval === "year"
                      ? PRO_EXTRA_SEAT_YEARLY_USD
                      : PRO_EXTRA_SEAT_MONTHLY_USD}
                    )
                  </span>
                ) : (
                  <span className="muted">
                    {" "}
                    ({PRO_INCLUDED_SEATS} seats included)
                  </span>
                )}
              </p>

              <button
                type="button"
                className="btn mt-4"
                disabled={pending}
                onClick={upgrade}
              >
                {pending ? "Redirecting…" : "Upgrade with Stripe"}
              </button>
            </>
          )}
          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        </section>
      ) : (
        <p className="muted text-sm">
          Only community owners and admins can change billing.
        </p>
      )}
    </div>
  );
}

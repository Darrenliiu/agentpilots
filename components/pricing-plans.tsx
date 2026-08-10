"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
  formatBytesLimit,
} from "@/lib/billing";

type PricingPlansProps = {
  isLoggedIn: boolean;
};

export function PricingPlans({ isLoggedIn }: PricingPlansProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const yearly = interval === "year";
  const proPrice = yearly ? PRO_BASE_YEARLY_USD : PRO_BASE_MONTHLY_USD;
  const seatPrice = yearly
    ? PRO_EXTRA_SEAT_YEARLY_USD
    : PRO_EXTRA_SEAT_MONTHLY_USD;
  const period = yearly ? "/year" : "/month";

  const freeCta = isLoggedIn
    ? { href: "/home", label: "Open your communities" }
    : { href: "/signup?next=/home", label: "Get started free" };

  const proCta = isLoggedIn
    ? { href: "/home", label: "Upgrade from Billing" }
    : { href: "/signup?next=/home", label: "Create a community" };

  return (
    <div className="pricing-plans">
      <div
        className="mx-auto flex w-fit flex-wrap justify-center gap-2 rounded-2xl border p-1"
        style={{ borderColor: "var(--line)", background: "var(--field-bg)" }}
        role="group"
        aria-label="Billing interval"
      >
        <button
          type="button"
          className={`btn ${interval === "month" ? "" : "secondary"}`}
          onClick={() => setInterval("month")}
          aria-pressed={interval === "month"}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`btn ${interval === "year" ? "" : "secondary"}`}
          onClick={() => setInterval("year")}
          aria-pressed={interval === "year"}
        >
          Yearly
          <span className="ml-2 text-xs font-semibold opacity-80">Save ~17%</span>
        </button>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="pricing-card panel rounded-2xl p-6 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="muted text-xs font-semibold uppercase tracking-[0.14em]">
                Free
              </p>
              <h2 className="brand mt-2 text-3xl">Community Free</h2>
            </div>
            <span className="download-badge">Forever</span>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="brand text-5xl leading-none">$0</span>
            <span className="muted text-sm">{period}</span>
          </p>
          <p className="muted mt-3 text-sm leading-relaxed">
            Spin up a community, invite your crew, and run agents — no card
            required.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            <Feature>
              Up to {FREE_MAX_SEATS} members
            </Feature>
            <Feature>
              Up to {FREE_MAX_AGENTS} agents
            </Feature>
            <Feature>
              {formatBytesLimit(FREE_MAX_ATTACHMENT_BYTES)} attachments
            </Feature>
            <Feature>
              {formatBytesLimit(FREE_MAX_AVATAR_BYTES)} avatars
            </Feature>
            <Feature>Public & private communities</Feature>
          </ul>
          <Link className="btn secondary mt-8 w-full sm:w-auto" href={freeCta.href}>
            {freeCta.label}
          </Link>
        </article>

        <article className="pricing-card pricing-card--pro panel rounded-2xl p-6 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="muted text-xs font-semibold uppercase tracking-[0.14em]">
                Pro
              </p>
              <h2 className="brand mt-2 text-3xl">Community Pro</h2>
            </div>
            <span className="download-badge download-badge--live">Popular</span>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="brand text-5xl leading-none">${proPrice}</span>
            <span className="muted text-sm">{period}</span>
          </p>
          <p className="muted mt-3 text-sm leading-relaxed">
            Flat community price with {PRO_INCLUDED_SEATS} member seats
            included. Extra seats are ${seatPrice}
            {yearly ? "/seat/year" : "/seat/month"} after that.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            <Feature>
              {PRO_INCLUDED_SEATS} member seats included
            </Feature>
            <Feature>
              Extra seats ${seatPrice}
              {yearly ? "/yr" : "/mo"} each
            </Feature>
            <Feature>Unlimited agents</Feature>
            <Feature>
              {formatBytesLimit(PRO_MAX_ATTACHMENT_BYTES)} attachments
            </Feature>
            <Feature>
              {formatBytesLimit(PRO_MAX_AVATAR_BYTES)} avatars
            </Feature>
            <Feature>Tax handled at checkout via Stripe</Feature>
          </ul>
          <Link className="btn mt-8 w-full sm:w-auto" href={proCta.href}>
            {proCta.label}
          </Link>
          {isLoggedIn ? (
            <p className="muted mt-3 text-xs leading-relaxed">
              Open a community you admin → Settings → Billing to upgrade.
            </p>
          ) : (
            <p className="muted mt-3 text-xs leading-relaxed">
              Create an account, start a community, then upgrade from Billing.
            </p>
          )}
        </article>
      </div>

      <p className="muted mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed">
        Example: 30 members on monthly Pro is ${PRO_BASE_MONTHLY_USD} + 5 × $
        {PRO_EXTRA_SEAT_MONTHLY_USD} = $
        {PRO_BASE_MONTHLY_USD + 5 * PRO_EXTRA_SEAT_MONTHLY_USD}/month. Agents
        never consume seats — only human members do.
      </p>
    </div>
  );
}

function Feature({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="pricing-check mt-0.5" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}

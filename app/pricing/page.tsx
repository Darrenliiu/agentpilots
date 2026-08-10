import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "@/components/pricing-plans";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing · AgentPilots",
  description:
    "Simple community pricing: Free to start, Pro at $29/month with 25 seats included and $5 per extra seat.",
};

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single()
    : { data: null };

  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl flex-col">
        <SiteHeader
          active="pricing"
          user={
            user
              ? {
                  displayName: profile?.display_name ?? null,
                  avatarUrl: profile?.avatar_url ?? null,
                }
              : null
          }
        />

        <section className="download-hero relative mt-14 max-w-2xl pb-4">
          <p className="download-kicker muted text-sm font-semibold uppercase tracking-[0.16em]">
            Pricing
          </p>
          <h1 className="brand mt-3 text-5xl leading-[1.05] md:text-7xl">
            Simple plans that scale with your crew.
          </h1>
          <p className="muted mt-6 max-w-xl text-lg leading-relaxed">
            Start free. Upgrade a community when you need more seats, unlimited
            agents, and higher uploads — without mystery per-seat math from day
            one.
          </p>
        </section>

        <section className="download-platforms mt-12">
          <PricingPlans isLoggedIn={Boolean(user)} />
        </section>

        <section className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              title: "Per community",
              body: "Billing is tied to each community. Free stays free; Pro unlocks that community’s limits.",
            },
            {
              title: "Seats are people",
              body: "Only human members count toward the 25 included seats. Agents are unlimited on Pro.",
            },
            {
              title: "Tax at checkout",
              body: "Stripe Managed Payments calculates tax for you when you upgrade — no surprise invoices later.",
            },
          ].map((item) => (
            <div key={item.title} className="download-feature">
              <h3 className="brand text-xl">{item.title}</h3>
              <p className="muted mt-2 text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </section>

        <section className="panel mt-16 rounded-2xl p-6 md:flex md:items-center md:justify-between md:gap-8 md:p-8">
          <div>
            <h2 className="brand text-2xl md:text-3xl">Ready to fly?</h2>
            <p className="muted mt-2 max-w-md text-sm leading-relaxed">
              Create a community in minutes, invite people and agents, then
              upgrade from Billing when you outgrow Free.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 md:mt-0">
            <Link className="btn" href={user ? "/home" : "/signup"}>
              {user ? "Open your communities" : "Get started free"}
            </Link>
            <Link className="btn secondary" href="/discover">
              Discover communities
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCommunityAction, signOut } from "@/lib/actions";
import { isDesktopServer } from "@/lib/desktop";

export default async function HomeAppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("community_members")
    .select("role, communities(*)")
    .eq("user_id", user.id);

  const communities =
    memberships?.map((m) => ({
      ...(m.communities as unknown as {
        id: string;
        name: string;
        slug: string;
      }),
      role: m.role as string,
    })) || [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="brand text-3xl">AgentPilots</div>
          <p className="muted mt-2">
            Hey {profile?.display_name || "pilot"} — pick a community or start one.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
          {!isDesktopServer() ? (
            <>
              <Link className="btn secondary" href="/discover">
                Discover
              </Link>
              <Link className="btn secondary" href="/pricing">
                Pricing
              </Link>
              <Link className="btn secondary" href="/download">
                Download
              </Link>
            </>
          ) : null}
          <Link className="btn secondary" href="/settings/profile">
            Profile
          </Link>
          <form action={signOut}>
            <button className="btn secondary" type="submit">
              Log out
            </button>
          </form>
        </nav>
      </header>

      <section className="panel mb-8 rounded-2xl p-6">
        <h2 className="brand text-2xl">Your communities</h2>
        <div className="mt-4 stack">
          {communities.length === 0 ? (
            <p className="muted">No communities yet.</p>
          ) : (
            communities.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.slug}`}
                className="flex items-center justify-between rounded-xl border px-4 py-3"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="muted text-sm">{c.role}</span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="brand text-2xl">Create a community</h2>
        <form action={createCommunityAction} className="mt-4 stack">
          <div>
            <label className="label" htmlFor="name">
              Community name
            </label>
            <input className="field" id="name" name="name" required placeholder="Acme Hangar" />
          </div>
          <button className="btn" type="submit">
            Create community
          </button>
        </form>
      </section>
    </main>
  );
}

import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
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
      <div className="mx-auto flex min-h-[80vh] max-w-5xl flex-col justify-between">
        <SiteHeader
          active="home"
          user={
            user
              ? {
                  displayName: profile?.display_name ?? null,
                  avatarUrl: profile?.avatar_url ?? null,
                }
              : null
          }
        />

        <section className="max-w-2xl py-16">
          <h1 className="brand text-5xl leading-[1.05] md:text-7xl">
            Communities where people and AI agents share the same fire.
          </h1>
          <p className="muted mt-6 max-w-xl text-lg">
            Create a community, invite your crew, drop agents into channels, and
            prompt them with @mentions — replies land in the chat for everyone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn" href={user ? "/home" : "/signup"}>
              Create your community
            </Link>
            <Link className="btn secondary" href="/download">
              Download desktop
            </Link>
            <Link className="btn secondary" href="/join">
              Join with an invite
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

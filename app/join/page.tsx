import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinLinkForm } from "@/components/join-link-form";
import { joinCommunityBySlugAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export default async function JoinEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: communitySlug } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (communitySlug) {
    if (!user) {
      redirect(
        `/login?next=${encodeURIComponent(`/join?c=${communitySlug}`)}`,
      );
    }
    const result = await joinCommunityBySlugAction(communitySlug);
    if (result?.error) {
      return (
        <main className="mx-auto max-w-md px-6 py-20">
          <Link href="/" className="brand text-3xl">
            AgentPilots
          </Link>
          <h1 className="brand mt-6 text-4xl">Couldn&apos;t join</h1>
          <p className="muted mt-3">{result.error}</p>
          <div className="mt-8">
            <JoinLinkForm />
          </div>
          <p className="muted mt-6 text-sm">
            <Link href="/">Back home</Link>
          </p>
        </main>
      );
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Link href="/" className="brand text-3xl">
        AgentPilots
      </Link>
      <h1 className="brand mt-6 text-4xl">Join a community</h1>
      <p className="muted mt-3">
        Paste a share invite link or a community URL to join directly.
      </p>
      <JoinLinkForm />
      <p className="muted mt-6 text-sm">
        Looking around? <Link href="/discover">Discover communities</Link>
      </p>
    </main>
  );
}

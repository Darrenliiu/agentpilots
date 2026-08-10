import { notFound, redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { updateProfileAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function CommunityProfileSettingsPage({
  params,
}: {
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${communitySlug}/settings/profile`);

  const { data: community } = await supabase
    .from("communities")
    .select("id, slug")
    .eq("slug", communitySlug)
    .single();
  if (!community) notFound();

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/home");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/home");

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="brand text-3xl">Profile</h1>
      <p className="muted mt-2">
        Update how your name and avatar appear across AgentPilots.
      </p>

      <section className="panel mt-6 rounded-2xl p-6">
        <ProfileForm
          profile={profile as Profile}
          action={updateProfileAction}
          next={`/c/${community.slug}/settings/profile`}
        />
      </section>
    </main>
  );
}

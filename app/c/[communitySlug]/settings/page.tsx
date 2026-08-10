import { notFound, redirect } from "next/navigation";
import { CommunitySettingsForm } from "@/components/community-settings-form";
import { updateCommunitySettingsAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Community, CommunityRole } from "@/lib/types";

export default async function CommunitySettingsPage({
  params,
}: {
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: community } = await supabase
    .from("communities")
    .select("*")
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

  const currentRole = membership.role as CommunityRole;
  const canEdit = currentRole === "owner" || currentRole === "admin";
  const c = community as Community;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="brand text-3xl">Community settings</h1>
      <p className="muted mt-2">
        Manage this community&apos;s profile, theme, and visibility.
      </p>

      <section className="panel mt-6 rounded-2xl p-5">
        <h2 className="mb-4 text-lg font-semibold">Details</h2>
        <CommunitySettingsForm
          community={{
            ...c,
            description: c.description ?? "",
            avatar_url: c.avatar_url ?? null,
            visibility: c.visibility ?? "private",
            theme: c.theme ?? "default",
          }}
          canEdit={canEdit}
          action={updateCommunitySettingsAction}
        />
      </section>
    </main>
  );
}

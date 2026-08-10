import { notFound, redirect } from "next/navigation";
import { CommunityShareLinkPanel } from "@/components/community-share-link";
import { InviteForm } from "@/components/invite-form";
import {
  createInviteAction,
  getOrCreateCommunityShareLinkAction,
} from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export default async function InvitesSettingsPage({
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
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return (
      <main className="p-8">
        <h1 className="brand text-3xl">Invites</h1>
        <p className="muted mt-3">Only admins can manage invites.</p>
      </main>
    );
  }

  const shareLink = await getOrCreateCommunityShareLinkAction(community.id);
  const sharePath =
    shareLink && "path" in shareLink ? shareLink.path : null;
  const shareExpiresAt =
    shareLink && "expiresAt" in shareLink ? shareLink.expiresAt : null;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="brand text-3xl">Invites</h1>
      <p className="muted mt-2">Share a link so friends join the same community.</p>

      <section className="panel mt-6 rounded-2xl p-5">
        <h2 className="text-base font-medium">Share link</h2>
        <div className="mt-4">
          <CommunityShareLinkPanel
            communityId={community.id}
            initialPath={sharePath}
            initialExpiresAt={shareExpiresAt ?? null}
          />
        </div>
      </section>

      <section className="panel mt-6 rounded-2xl p-5">
        <h2 className="text-base font-medium">Invite by email</h2>
        <p className="muted mt-1 text-sm">
          Optional: create a one-time link for a specific person.
        </p>
        <div className="mt-4">
          <InviteForm communityId={community.id} action={createInviteAction} />
        </div>
      </section>
    </main>
  );
}

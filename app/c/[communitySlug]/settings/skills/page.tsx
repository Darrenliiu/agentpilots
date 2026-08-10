import { notFound, redirect } from "next/navigation";
import { SkillsSettingsPanel } from "@/components/skills-settings-panel";
import {
  createCustomSkillAction,
  deleteSkillAction,
  importSkillFromRegistryAction,
  toggleSkillAction,
} from "@/lib/actions-connectors";
import { createClient } from "@/lib/supabase/server";
import type { CommunityRole, Skill } from "@/lib/types";

export default async function SkillsSettingsPage({
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

  const isAdmin = ["owner", "admin"].includes(membership.role as CommunityRole);

  const { data: skills } = await supabase
    .from("skills")
    .select("*")
    .eq("community_id", community.id)
    .order("name");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="brand text-3xl">Skills</h1>
      <p className="muted mt-2">
        Import SKILL.md packs from public registries and attach them in chat.
      </p>

      <div className="mt-6">
        <SkillsSettingsPanel
          communityId={community.id}
          isAdmin={isAdmin}
          skills={(skills || []) as Skill[]}
          importAction={importSkillFromRegistryAction}
          createAction={createCustomSkillAction}
          toggleAction={toggleSkillAction}
          deleteAction={deleteSkillAction}
        />
      </div>
    </main>
  );
}

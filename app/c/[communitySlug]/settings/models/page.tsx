import { notFound, redirect } from "next/navigation";
import { LocalModelsPanel } from "@/components/local-models-panel";
import { createClient } from "@/lib/supabase/server";

export default async function LocalModelsSettingsPage({
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
    .select("id, slug")
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
        <h1 className="brand text-3xl">Local models</h1>
        <p className="muted mt-3">Only admins can manage local models.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="brand text-3xl">Local models</h1>
        <p className="muted mt-2 max-w-2xl">
          On-device LLMs powered by llama.cpp. Bundled small models are ready
          offline; larger models can be downloaded when you need more quality.
        </p>
      </div>

      <LocalModelsPanel hideHeader />
    </main>
  );
}

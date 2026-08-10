import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { updateProfileAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/home");

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <div className="mb-8">
        <Link href="/home" className="muted text-sm">
          ← Back to home
        </Link>
        <h1 className="brand mt-3 text-3xl">Profile settings</h1>
        <p className="muted mt-2">
          Set your display name and photo. Your avatar appears next to your
          messages in channels.
        </p>
      </div>

      <section className="panel rounded-2xl p-6">
        <ProfileForm
          profile={profile as Profile}
          action={updateProfileAction}
        />
      </section>
    </main>
  );
}

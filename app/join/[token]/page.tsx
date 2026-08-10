import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JoinClient } from "@/components/join-client";
import { acceptInviteAction } from "@/lib/actions";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: preview } = await supabase.rpc("get_invite_preview", {
    p_token: token,
  });
  const invite = Array.isArray(preview) ? preview[0] : preview;

  if (!invite) {
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <h1 className="brand text-3xl">Invite unavailable</h1>
        <p className="muted mt-3">This invite is invalid or expired.</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <div className="brand text-3xl">AgentPilots</div>
        <h1 className="brand mt-6 text-4xl">Join {invite.community_name}</h1>
        <p className="muted mt-3">Sign in or create an account to accept this invite.</p>
        <div className="mt-8 flex gap-3">
          <Link className="btn" href={`/signup?next=/join/${token}`}>
            Create account
          </Link>
          <Link className="btn secondary" href={`/login?next=/join/${token}`}>
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <div className="brand text-3xl">AgentPilots</div>
      <h1 className="brand mt-6 text-4xl">Join {invite.community_name}</h1>
      <p className="muted mt-3">
        You&apos;ve been invited to collaborate with people and agents in this community.
      </p>
      <JoinClient token={token} acceptAction={acceptInviteAction} />
    </main>
  );
}

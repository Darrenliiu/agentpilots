"use client";

import { useState, useTransition } from "react";
import { absoluteShareUrl } from "@/lib/site-url";

export function InviteForm({
  communityId,
  action,
}: {
  communityId: string;
  action: (
    communityId: string,
    formData: FormData,
  ) => Promise<{ error?: string; token?: string }>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(fd) => {
        start(async () => {
          const res = await action(communityId, fd);
          if (res.error) setError(res.error);
          if (res.token) {
            setToken(res.token);
            setError(null);
          }
        });
      }}
    >
      <div>
        <label className="label" htmlFor="email">
          Email (optional)
        </label>
        <input
          className="field"
          id="email"
          name="email"
          type="email"
          placeholder="friend@example.com"
        />
        <p className="muted mt-1.5 text-xs">
          Creates a one-time invite link. Leave blank for a single-use link you
          can send yourself.
        </p>
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      {token ? (
        <p className="rounded-xl bg-black/5 p-3 text-sm break-all">
          Invite link: {absoluteShareUrl(`/join/${token}`)}
        </p>
      ) : null}
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create email invite"}
      </button>
    </form>
  );
}

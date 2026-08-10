"use client";

import { useState, useTransition } from "react";

export function JoinClient({
  token,
  acceptAction,
}: {
  token: string;
  acceptAction: (token: string) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-8 stack">
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptAction(token);
            if (res && "error" in res && res.error) setError(res.error);
          })
        }
      >
        {pending ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}

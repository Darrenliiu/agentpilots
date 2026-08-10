"use client";

import { useState, useTransition } from "react";
import { resolveJoinLinkAction } from "@/lib/actions";

export function JoinLinkForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-8 stack"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await resolveJoinLinkAction(formData);
          if (res && "error" in res && res.error) setError(res.error);
        });
      }}
    >
      <div>
        <label className="label" htmlFor="link">
          Invite link or community URL
        </label>
        <input
          className="field"
          id="link"
          name="link"
          required
          placeholder="https://…/join/… or /c/community-slug"
          autoComplete="off"
        />
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Joining…" : "Continue"}
      </button>
    </form>
  );
}

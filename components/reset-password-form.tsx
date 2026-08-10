"use client";

import { useState, useTransition } from "react";
import { updatePasswordAction } from "@/lib/actions";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(fd) => {
        start(async () => {
          setError(null);
          const res = await updatePasswordAction(fd);
          if (res?.error) setError(res.error);
        });
      }}
    >
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm_password">
          Confirm password
        </label>
        <input
          className="field"
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestPasswordResetAction } from "@/lib/actions";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(fd) => {
        start(async () => {
          setError(null);
          setMessage(null);
          const res = await requestPasswordResetAction(fd);
          if ("error" in res && res.error) setError(res.error);
          else if ("message" in res && res.message) setMessage(res.message);
        });
      }}
    >
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="field"
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      {message ? <p className="muted text-sm">{message}</p> : null}
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="muted text-sm">
        <Link href="/login">Back to log in</Link>
      </p>
    </form>
  );
}

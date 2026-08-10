"use client";

import { useEffect, useState, useTransition } from "react";
import { signIn, signUp } from "@/lib/actions";

const REMEMBERED_EMAIL_KEY = "ap_remembered_email";

export function AuthForm({
  mode,
  next = "/home",
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    if (mode !== "login") return;
    try {
      const saved = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    } catch {
      // Ignore private-mode / storage errors.
    }
  }, [mode]);

  return (
    <form
      className="stack"
      action={(fd) => {
        start(async () => {
          fd.set("next", next);
          if (mode === "login") {
            try {
              if (rememberMe) {
                window.localStorage.setItem(
                  REMEMBERED_EMAIL_KEY,
                  String(fd.get("email") || "").trim(),
                );
              } else {
                window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
              }
            } catch {
              // Ignore private-mode / storage errors.
            }
          }
          const res = mode === "login" ? await signIn(fd) : await signUp(fd);
          if (res?.error) setError(res.error);
        });
      }}
    >
      {mode === "signup" ? (
        <div>
          <label className="label" htmlFor="display_name">
            Display name
          </label>
          <input className="field" id="display_name" name="display_name" required />
        </div>
      ) : null}
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
        />
      </div>
      {mode === "login" ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="remember_me"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Remember me
        </label>
      ) : null}
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      <button className="btn" disabled={pending} type="submit">
        {pending ? "Working…" : mode === "login" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}

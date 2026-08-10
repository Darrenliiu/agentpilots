import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Handles Supabase auth redirects (password recovery, email links).
 * Exchange the code for a session, then send the user onward.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/auth/reset");
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient({ rememberMe: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination =
        type === "recovery" || next === "/auth/reset" ? "/auth/reset" : next;
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("Auth link expired or invalid")}`,
      origin,
    ),
  );
}

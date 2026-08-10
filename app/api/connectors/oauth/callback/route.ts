import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/agents/encrypt";
import {
  exchangeAuthorizationCode,
  takeOAuthState,
} from "@/lib/connectors/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieHeader = request.headers.get("cookie") || "";
  const clientId = cookieValue(cookieHeader, "mcp_oauth_client_id");
  const tokenEndpoint = cookieValue(cookieHeader, "mcp_oauth_token_endpoint");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/home?connector_error=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 });
  }

  const pending = takeOAuthState(state);
  if (!pending) {
    return NextResponse.json(
      { error: "Invalid or expired OAuth state" },
      { status: 400 },
    );
  }

  if (!clientId || !tokenEndpoint) {
    return NextResponse.redirect(
      new URL(
        `/c/${pending.communitySlug}/settings/connectors?error=oauth_session`,
        request.url,
      ),
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connectors/oauth/callback`;

  const tokens = await exchangeAuthorizationCode({
    tokenEndpoint,
    code,
    redirectUri,
    codeVerifier: pending.codeVerifier,
    clientId,
  });

  if (!tokens) {
    return NextResponse.redirect(
      new URL(
        `/c/${pending.communitySlug}/settings/connectors?error=token_exchange`,
        request.url,
      ),
    );
  }

  const admin = createAdminClient();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { data: existing } = await admin
    .from("user_connector_accounts")
    .select("id")
    .eq("community_connector_id", pending.communityConnectorId)
    .eq("user_id", pending.userId)
    .eq("is_shared", false)
    .maybeSingle();

  const payload = {
    encrypted_access_token: encryptSecret(tokens.access_token),
    encrypted_refresh_token: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : null,
    token_expires_at: expiresAt,
    status: "connected" as const,
    error: null,
  };

  if (existing) {
    await admin
      .from("user_connector_accounts")
      .update(payload)
      .eq("id", existing.id);
  } else {
    await admin.from("user_connector_accounts").insert({
      community_connector_id: pending.communityConnectorId,
      user_id: pending.userId,
      is_shared: false,
      ...payload,
    });
  }

  const response = NextResponse.redirect(
    new URL(
      `/c/${pending.communitySlug}/settings/connectors?connected=1`,
      request.url,
    ),
  );
  response.cookies.set("mcp_oauth_client_id", "", { maxAge: 0, path: "/" });
  response.cookies.set("mcp_oauth_token_endpoint", "", {
    maxAge: 0,
    path: "/",
  });
  return response;
}

function cookieValue(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

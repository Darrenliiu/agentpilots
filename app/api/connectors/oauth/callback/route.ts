import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/agents/encrypt";
import {
  MCP_OAUTH_STATE_COOKIE,
  cookieValue,
  decodeOAuthStateCookie,
  exchangeAuthorizationCode,
} from "@/lib/connectors/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieHeader = request.headers.get("cookie") || "";
  const pending = decodeOAuthStateCookie(
    cookieValue(cookieHeader, MCP_OAUTH_STATE_COOKIE),
  );

  const clearPending = (response: NextResponse) => {
    response.cookies.set(MCP_OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  };

  if (error) {
    const slug = pending?.communitySlug;
    if (slug) {
      return clearPending(
        NextResponse.redirect(
          new URL(
            `/c/${slug}/settings/connectors?error=${encodeURIComponent(error)}`,
            request.url,
          ),
        ),
      );
    }
    return clearPending(
      NextResponse.redirect(
        new URL(
          `/home?connector_error=${encodeURIComponent(error)}`,
          request.url,
        ),
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 });
  }

  if (!pending || pending.state !== state) {
    const slug = pending?.communitySlug;
    if (slug) {
      return clearPending(
        NextResponse.redirect(
          new URL(
            `/c/${slug}/settings/connectors?error=oauth_session`,
            request.url,
          ),
        ),
      );
    }
    return clearPending(
      NextResponse.json(
        { error: "Invalid or expired OAuth state" },
        { status: 400 },
      ),
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connectors/oauth/callback`;

  const tokens = await exchangeAuthorizationCode({
    tokenEndpoint: pending.tokenEndpoint,
    code,
    redirectUri,
    codeVerifier: pending.codeVerifier,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    resource: pending.resource,
  });

  if (!tokens) {
    return clearPending(
      NextResponse.redirect(
        new URL(
          `/c/${pending.communitySlug}/settings/connectors?error=token_exchange`,
          request.url,
        ),
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
    oauth_client_id: pending.clientId,
    encrypted_oauth_client_secret: pending.clientSecret
      ? encryptSecret(pending.clientSecret)
      : null,
    oauth_token_endpoint: pending.tokenEndpoint,
    oauth_resource: pending.resource,
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

  return clearPending(
    NextResponse.redirect(
      new URL(
        `/c/${pending.communitySlug}/settings/connectors?connected=1`,
        request.url,
      ),
    ),
  );
}

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  MCP_OAUTH_STATE_COOKIE,
  createPkcePair,
  discoverOAuthMetadata,
  encodeOAuthStateCookie,
  resolveOAuthClient,
} from "@/lib/connectors/oauth";
import { createClient } from "@/lib/supabase/server";

function connectorsErrorRedirect(
  request: Request,
  communitySlug: string,
  error: string,
) {
  return NextResponse.redirect(
    new URL(
      `/c/${communitySlug}/settings/connectors?error=${encodeURIComponent(error)}`,
      request.url,
    ),
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get("connector_id");
  const communitySlug = searchParams.get("community_slug");
  if (!connectorId || !communitySlug) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const { data: connector } = await supabase
    .from("community_connectors")
    .select("*")
    .eq("id", connectorId)
    .single();

  if (!connector || connector.auth_type !== "oauth") {
    return connectorsErrorRedirect(
      request,
      communitySlug,
      "oauth_unavailable",
    );
  }

  const meta = await discoverOAuthMetadata(connector.mcp_url);
  if (!meta) {
    return connectorsErrorRedirect(
      request,
      communitySlug,
      "oauth_discovery",
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connectors/oauth/callback`;
  const { codeVerifier, codeChallenge } = createPkcePair();
  const state = randomBytes(24).toString("hex");

  const client = await resolveOAuthClient({
    connectorSlug: connector.slug,
    meta,
    origin,
    redirectUri,
  });

  if (!client?.clientId) {
    return connectorsErrorRedirect(request, communitySlug, "oauth_client");
  }

  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", client.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("resource", meta.resource);
  if (meta.scopes) {
    authUrl.searchParams.set("scope", meta.scopes);
  }

  let pendingCookie: string;
  try {
    pendingCookie = encodeOAuthStateCookie({
      state,
      communityConnectorId: connectorId,
      userId: user.id,
      communitySlug,
      mcpUrl: connector.mcp_url,
      codeVerifier,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      tokenEndpoint: meta.token_endpoint,
      resource: meta.resource,
      createdAt: Date.now(),
    });
  } catch {
    return connectorsErrorRedirect(
      request,
      communitySlug,
      "oauth_encryption",
    );
  }

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(MCP_OAUTH_STATE_COOKIE, pendingCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
  return response;
}

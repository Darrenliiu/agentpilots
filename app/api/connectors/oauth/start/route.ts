import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  createPkcePair,
  discoverOAuthMetadata,
  dynamicClientRegister,
  storeOAuthState,
} from "@/lib/connectors/oauth";
import { createClient } from "@/lib/supabase/server";

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
    return NextResponse.json(
      { error: "OAuth not available for this connector" },
      { status: 400 },
    );
  }

  const meta = await discoverOAuthMetadata(connector.mcp_url);
  if (!meta) {
    return NextResponse.json(
      {
        error:
          "Could not discover OAuth endpoints. Use a bearer/API token instead.",
      },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connectors/oauth/callback`;
  const { codeVerifier, codeChallenge } = createPkcePair();
  const state = randomBytes(24).toString("hex");

  let clientId =
    process.env.MCP_OAUTH_CLIENT_ID ||
    process.env[`MCP_OAUTH_CLIENT_ID_${connector.slug.toUpperCase()}`];

  if (!clientId && meta.registration_endpoint) {
    const reg = await dynamicClientRegister(
      meta.registration_endpoint,
      redirectUri,
    );
    clientId = reg?.client_id;
    if (reg?.client_secret) {
      // Store secret on state via env is not possible; embed in pending via encrypt later if needed
      // For public clients (auth_method none) secret is optional
    }
  }

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "No OAuth client_id configured. Set MCP_OAUTH_CLIENT_ID or use a bearer token.",
      },
      { status: 400 },
    );
  }

  storeOAuthState(state, {
    communityConnectorId: connectorId,
    userId: user.id,
    communitySlug,
    mcpUrl: connector.mcp_url,
    codeVerifier,
    createdAt: Date.now(),
  });

  // Stash client_id on cookie for callback
  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("scope", "openid offline_access");

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("mcp_oauth_client_id", clientId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
  response.cookies.set("mcp_oauth_token_endpoint", meta.token_endpoint, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
  return response;
}

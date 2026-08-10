import { createHash, randomBytes } from "crypto";

export type OAuthPendingState = {
  communityConnectorId: string;
  userId: string;
  communitySlug: string;
  mcpUrl: string;
  codeVerifier: string;
  createdAt: number;
};

// BEST-EFFORT: in-memory OAuth PKCE state. On Vercel serverless this can fail when
// start/callback land on different instances. Core chat/agents do not depend on this;
// replace with cookie- or DB-backed state before relying on connector OAuth in prod.
const pending = new Map<string, OAuthPendingState>();

export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function storeOAuthState(state: string, data: OAuthPendingState) {
  pending.set(state, data);
  // prune old
  const cutoff = Date.now() - 1000 * 60 * 15;
  for (const [k, v] of pending) {
    if (v.createdAt < cutoff) pending.delete(k);
  }
}

export function takeOAuthState(state: string): OAuthPendingState | null {
  const data = pending.get(state) || null;
  if (data) pending.delete(state);
  return data;
}

/**
 * Discover OAuth metadata for an MCP server (RFC 8414 / MCP OAuth).
 * Falls back to common well-known paths derived from the MCP URL origin.
 */
export async function discoverOAuthMetadata(mcpUrl: string): Promise<{
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
} | null> {
  const url = new URL(mcpUrl);
  const candidates = [
    `${url.origin}/.well-known/oauth-authorization-server`,
    `${url.origin}/.well-known/openid-configuration`,
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        authorization_endpoint?: string;
        token_endpoint?: string;
        registration_endpoint?: string;
      };
      if (data.authorization_endpoint && data.token_endpoint) {
        return {
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          registration_endpoint: data.registration_endpoint,
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function dynamicClientRegister(
  registrationEndpoint: string,
  redirectUri: string,
  clientName = "AgentPilots",
): Promise<{ client_id: string; client_secret?: string } | null> {
  try {
    const res = await fetch(registrationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      client_id?: string;
      client_secret?: string;
    };
    if (!data.client_id) return null;
    return { client_id: data.client_id, client_secret: data.client_secret };
  } catch {
    return null;
  }
}

export async function exchangeAuthorizationCode(opts: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
} | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);

  try {
    const res = await fetch(opts.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  } catch {
    return null;
  }
}

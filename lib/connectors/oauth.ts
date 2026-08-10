import { createHash, randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/agents/encrypt";

export const MCP_OAUTH_STATE_COOKIE = "mcp_oauth_pending";
export const MCP_CLIENT_METADATA_PATH = "/oauth/mcp-client-metadata";

export type OAuthPendingState = {
  state: string;
  communityConnectorId: string;
  userId: string;
  communitySlug: string;
  mcpUrl: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  resource: string;
  createdAt: number;
};

export type DiscoveredOAuth = {
  resource: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  /** Space-separated scopes to request (MCP scope selection strategy). */
  scopes?: string;
  client_id_metadata_document_supported?: boolean;
};

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function mcpClientMetadataUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}${MCP_CLIENT_METADATA_PATH}`;
}

export function buildMcpClientMetadata(origin: string) {
  const base = origin.replace(/\/$/, "");
  const clientId = mcpClientMetadataUrl(base);
  const redirectUris = new Set<string>([
    `${base}/api/connectors/oauth/callback`,
    "http://localhost:3000/api/connectors/oauth/callback",
    "https://agentpilots.ai/api/connectors/oauth/callback",
  ]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    redirectUris.add(
      `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/connectors/oauth/callback`,
    );
  }
  return {
    client_id: clientId,
    client_name: "AgentPilots",
    client_uri: base,
    redirect_uris: [...redirectUris],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
  };
}

export function encodeOAuthStateCookie(data: OAuthPendingState): string {
  return encodeURIComponent(encryptSecret(JSON.stringify(data)));
}

export function decodeOAuthStateCookie(
  raw: string | null | undefined,
): OAuthPendingState | null {
  if (!raw) return null;
  try {
    const decrypted = decryptSecret(decodeURIComponent(raw));
    const data = JSON.parse(decrypted) as OAuthPendingState;
    if (
      !data?.state ||
      !data.codeVerifier ||
      !data.clientId ||
      !data.tokenEndpoint ||
      !data.resource ||
      !data.communityConnectorId
    ) {
      return null;
    }
    if (Date.now() - data.createdAt > 1000 * 60 * 15) return null;
    return data;
  } catch {
    return null;
  }
}

function canonicalResource(mcpUrl: string, resourceFromMeta?: string): string {
  const raw = resourceFromMeta || mcpUrl;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/$/, "");
    return path ? `${url.origin}${path}` : url.origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function parseWwwAuthenticate(header: string | null): {
  resourceMetadata?: string;
  scope?: string;
} {
  if (!header) return {};
  const resourceMetadata =
    header.match(/resource_metadata=(?:"([^"]+)"|([^\s,]+))/i)?.[1] ||
    header.match(/resource_metadata=(?:"([^"]+)"|([^\s,]+))/i)?.[2];
  const scope =
    header.match(/(?:^|[\s,])scope=(?:"([^"]+)"|([^\s,]+))/i)?.[1] ||
    header.match(/(?:^|[\s,])scope=(?:"([^"]+)"|([^\s,]+))/i)?.[2];
  return { resourceMetadata, scope };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function protectedResourceMetadataUrls(mcpUrl: string): string[] {
  const url = new URL(mcpUrl);
  const path = url.pathname.replace(/\/$/, "");
  const candidates: string[] = [];
  if (path) {
    candidates.push(
      `${url.origin}/.well-known/oauth-protected-resource${path}`,
    );
  }
  candidates.push(`${url.origin}/.well-known/oauth-protected-resource`);
  return candidates;
}

function authorizationServerMetadataUrls(issuer: string): string[] {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/$/, "");
  if (path) {
    return [
      `${url.origin}/.well-known/oauth-authorization-server${path}`,
      `${url.origin}/.well-known/openid-configuration${path}`,
      `${url.origin}${path}/.well-known/openid-configuration`,
    ];
  }
  return [
    `${url.origin}/.well-known/oauth-authorization-server`,
    `${url.origin}/.well-known/openid-configuration`,
  ];
}

type ProtectedResourceMeta = {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
};

type AuthorizationServerMeta = {
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  client_id_metadata_document_supported?: boolean;
};

async function discoverAuthorizationServer(
  issuer: string,
): Promise<AuthorizationServerMeta | null> {
  for (const candidate of authorizationServerMetadataUrls(issuer)) {
    const data = await fetchJson<AuthorizationServerMeta>(candidate);
    if (data?.authorization_endpoint && data?.token_endpoint) {
      return data;
    }
  }
  return null;
}

/**
 * MCP OAuth discovery: 401 WWW-Authenticate → Protected Resource Metadata
 * (RFC 9728) → Authorization Server Metadata (RFC 8414 / OIDC).
 */
export async function discoverOAuthMetadata(
  mcpUrl: string,
): Promise<DiscoveredOAuth | null> {
  let challengeScope: string | undefined;
  let resourceMetadataUrl: string | undefined;

  try {
    const probe = await fetch(mcpUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "MCP-Protocol-Version": "2025-11-25",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const www = probe.headers.get("www-authenticate");
    const parsed = parseWwwAuthenticate(www);
    resourceMetadataUrl = parsed.resourceMetadata;
    challengeScope = parsed.scope;
  } catch {
    // continue with well-known probing
  }

  const prmCandidates = [
    ...(resourceMetadataUrl ? [resourceMetadataUrl] : []),
    ...protectedResourceMetadataUrls(mcpUrl),
  ];

  let prm: ProtectedResourceMeta | null = null;
  for (const candidate of prmCandidates) {
    prm = await fetchJson<ProtectedResourceMeta>(candidate);
    if (prm?.authorization_servers?.length) break;
    prm = null;
  }

  if (!prm?.authorization_servers?.length) {
    // Legacy fallback: AS metadata on the MCP origin (some hosts mirror it).
    const url = new URL(mcpUrl);
    const legacy = await discoverAuthorizationServer(url.origin);
    if (!legacy?.authorization_endpoint || !legacy.token_endpoint) return null;
    return {
      resource: canonicalResource(mcpUrl),
      authorization_endpoint: legacy.authorization_endpoint,
      token_endpoint: legacy.token_endpoint,
      registration_endpoint: legacy.registration_endpoint,
      scopes: challengeScope,
      client_id_metadata_document_supported:
        legacy.client_id_metadata_document_supported,
    };
  }

  const issuer = prm.authorization_servers[0];
  const as = await discoverAuthorizationServer(issuer);
  if (!as?.authorization_endpoint || !as.token_endpoint) return null;

  const scopes =
    challengeScope ||
    (prm.scopes_supported?.length
      ? prm.scopes_supported.join(" ")
      : undefined);

  return {
    resource: canonicalResource(mcpUrl, prm.resource),
    authorization_endpoint: as.authorization_endpoint,
    token_endpoint: as.token_endpoint,
    registration_endpoint: as.registration_endpoint,
    scopes,
    client_id_metadata_document_supported:
      as.client_id_metadata_document_supported,
  };
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

export async function resolveOAuthClient(opts: {
  connectorSlug: string;
  meta: DiscoveredOAuth;
  origin: string;
  redirectUri: string;
}): Promise<{ clientId: string; clientSecret?: string } | null> {
  const slugKey = opts.connectorSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  const fromEnv =
    process.env[`MCP_OAUTH_CLIENT_ID_${slugKey}`] ||
    process.env.MCP_OAUTH_CLIENT_ID;
  if (fromEnv) {
    return {
      clientId: fromEnv,
      clientSecret:
        process.env[`MCP_OAUTH_CLIENT_SECRET_${slugKey}`] ||
        process.env.MCP_OAUTH_CLIENT_SECRET ||
        undefined,
    };
  }

  if (opts.meta.client_id_metadata_document_supported) {
    return { clientId: mcpClientMetadataUrl(opts.origin) };
  }

  if (opts.meta.registration_endpoint) {
    const reg = await dynamicClientRegister(
      opts.meta.registration_endpoint,
      opts.redirectUri,
    );
    if (reg?.client_id) {
      return { clientId: reg.client_id, clientSecret: reg.client_secret };
    }
  }

  return null;
}

export async function exchangeAuthorizationCode(opts: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<OAuthTokens | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
  if (opts.resource) body.set("resource", opts.resource);

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

export async function refreshAccessToken(opts: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<OAuthTokens | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
  if (opts.resource) body.set("resource", opts.resource);

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

export function cookieValue(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

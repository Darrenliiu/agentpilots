import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { decryptSecret } from "@/lib/agents/encrypt";
import type { CommunityConnector } from "@/lib/types";

export type ConnectorCredential = {
  accessToken?: string | null;
  refreshToken?: string | null;
};

export async function openConnectorMcpClient(
  connector: Pick<CommunityConnector, "id" | "slug" | "mcp_url" | "auth_type">,
  credential: ConnectorCredential,
): Promise<{ client: MCPClient; close: () => Promise<void> }> {
  const headers: Record<string, string> = {};
  if (
    (connector.auth_type === "bearer" || connector.auth_type === "oauth") &&
    credential.accessToken
  ) {
    headers.Authorization = `Bearer ${credential.accessToken}`;
  }

  const client = await createMCPClient({
    transport: {
      type: "http",
      url: connector.mcp_url,
      headers: Object.keys(headers).length ? headers : undefined,
    },
  });

  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch {
        // ignore close errors
      }
    },
  };
}

export function decryptConnectorToken(
  encrypted: string | null | undefined,
): string | null {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted);
  } catch {
    return null;
  }
}

/** Namespace tool names as connectorSlug__toolName to avoid collisions. */
export function namespaceTools(
  slug: string,
  tools: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const safe = slug.replace(/[^a-zA-Z0-9_]/g, "_");
  for (const [name, tool] of Object.entries(tools)) {
    out[`${safe}__${name}`] = tool;
  }
  return out;
}

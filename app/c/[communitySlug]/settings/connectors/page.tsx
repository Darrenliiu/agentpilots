import { notFound, redirect } from "next/navigation";
import { ConnectorsSettingsPanel } from "@/components/connectors-settings-panel";
import {
  addCustomConnectorAction,
  connectBearerConnectorAction,
  connectNoneConnectorAction,
  deleteCommunityConnectorAction,
  disconnectConnectorAction,
  enableCatalogConnectorAction,
  setConnectorSharedSecretFlagAction,
  toggleCommunityConnectorAction,
} from "@/lib/actions-connectors";
import { createClient } from "@/lib/supabase/server";
import type {
  CommunityConnector,
  ConnectorCatalogItem,
  CommunityRole,
} from "@/lib/types";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_discovery:
    "Could not discover OAuth endpoints for this connector. Paste an API token below, or try again later.",
  oauth_client:
    "No OAuth client could be registered for this connector. Set MCP_OAUTH_CLIENT_ID for this app, or paste an API token.",
  oauth_unavailable: "OAuth is not available for this connector.",
  oauth_session: "OAuth session expired. Click Connect with OAuth again.",
  oauth_encryption:
    "Server encryption is not configured (AGENTPILOTS_ENCRYPTION_KEY).",
  token_exchange:
    "OAuth token exchange failed. Try again, or paste an API token instead.",
  access_denied: "OAuth access was denied.",
};

function oauthNoticeFromSearch(searchParams: {
  connected?: string;
  error?: string;
}): { kind: "success" | "error"; message: string } | null {
  if (searchParams.connected === "1") {
    return {
      kind: "success",
      message: "Connector connected successfully.",
    };
  }
  if (searchParams.error) {
    return {
      kind: "error",
      message:
        OAUTH_ERROR_MESSAGES[searchParams.error] ||
        `OAuth connection failed: ${searchParams.error}`,
    };
  }
  return null;
}

export default async function ConnectorsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { communitySlug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: community } = await supabase
    .from("communities")
    .select("*")
    .eq("slug", communitySlug)
    .single();
  if (!community) notFound();

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/home");

  const isAdmin = ["owner", "admin"].includes(membership.role as CommunityRole);

  const { data: catalog } = await supabase
    .from("connector_catalog")
    .select("*")
    .order("name");

  const { data: connectors } = await supabase
    .from("community_connectors")
    .select("*, catalog:connector_catalog(id, slug, name, icon)")
    .eq("community_id", community.id)
    .order("name");

  const connectorIds = (connectors || []).map((c) => c.id);
  let connectedIds: string[] = [];
  let sharedIds: string[] = [];
  if (connectorIds.length) {
    const { data: accounts } = await supabase
      .from("user_connector_accounts")
      .select("community_connector_id, is_shared, user_id, status")
      .in("community_connector_id", connectorIds)
      .eq("status", "connected");

    connectedIds = (accounts || [])
      .filter((a) => !a.is_shared && a.user_id === user.id)
      .map((a) => a.community_connector_id);
    sharedIds = (accounts || [])
      .filter((a) => a.is_shared)
      .map((a) => a.community_connector_id);
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="brand text-3xl">Connectors</h1>
      <p className="muted mt-2">
        Connect MCP apps so agents can read and write tools you grant access to.
      </p>

      <div className="mt-6">
        <ConnectorsSettingsPanel
          communityId={community.id}
          communitySlug={community.slug}
          isAdmin={isAdmin}
          catalog={(catalog || []) as ConnectorCatalogItem[]}
          connectors={(connectors || []) as CommunityConnector[]}
          connectedIds={connectedIds}
          sharedIds={sharedIds}
          oauthNotice={oauthNoticeFromSearch(query)}
          enableCatalogAction={enableCatalogConnectorAction}
          addCustomAction={addCustomConnectorAction}
          toggleAction={toggleCommunityConnectorAction}
          deleteAction={deleteCommunityConnectorAction}
          connectBearerAction={connectBearerConnectorAction}
          connectNoneAction={connectNoneConnectorAction}
          disconnectAction={disconnectConnectorAction}
          setSharedFlagAction={setConnectorSharedSecretFlagAction}
        />
      </div>
    </main>
  );
}

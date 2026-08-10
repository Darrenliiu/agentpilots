"use client";

import { useMemo, useState, useTransition } from "react";
import { ConnectorIcon } from "@/components/connector-icon";
import type { CommunityConnector, ConnectorCatalogItem } from "@/lib/types";

function matchesQuery(
  query: string,
  ...parts: Array<string | null | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((p) => (p || "").toLowerCase().includes(q));
}

export function ConnectorsSettingsPanel({
  communityId,
  communitySlug,
  isAdmin,
  catalog,
  connectors,
  connectedIds,
  sharedIds,
  oauthNotice,
  enableCatalogAction,
  addCustomAction,
  toggleAction,
  deleteAction,
  connectBearerAction,
  connectNoneAction,
  disconnectAction,
  setSharedFlagAction,
}: {
  communityId: string;
  communitySlug: string;
  isAdmin: boolean;
  catalog: ConnectorCatalogItem[];
  connectors: CommunityConnector[];
  connectedIds: string[];
  sharedIds: string[];
  oauthNotice?: { kind: "success" | "error"; message: string } | null;
  enableCatalogAction: (formData: FormData) => Promise<{ error?: string } | void>;
  addCustomAction: (formData: FormData) => Promise<{ error?: string } | void>;
  toggleAction: (formData: FormData) => Promise<{ error?: string } | void>;
  deleteAction: (formData: FormData) => Promise<{ error?: string } | void>;
  connectBearerAction: (formData: FormData) => Promise<{ error?: string } | void>;
  connectNoneAction: (formData: FormData) => Promise<{ error?: string } | void>;
  disconnectAction: (formData: FormData) => Promise<{ error?: string } | void>;
  setSharedFlagAction: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const enabledSlugs = new Set(connectors.map((c) => c.slug));

  const filteredCatalog = useMemo(
    () =>
      catalog.filter((item) =>
        matchesQuery(query, item.name, item.slug, item.description),
      ),
    [catalog, query],
  );

  const filteredConnectors = useMemo(
    () =>
      connectors.filter((c) =>
        matchesQuery(query, c.name, c.slug, c.mcp_url, c.catalog?.name),
      ),
    [connectors, query],
  );

  function run(action: (fd: FormData) => Promise<{ error?: string } | void>, fd: FormData) {
    start(async () => {
      const res = await action(fd);
      if (res && "error" in res && res.error) setError(res.error);
      else setError(null);
    });
  }

  return (
    <div className="stack">
      {oauthNotice?.kind === "success" ? (
        <p className="text-sm" style={{ color: "var(--success, #15803d)" }}>
          {oauthNotice.message}
        </p>
      ) : null}
      {oauthNotice?.kind === "error" ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {oauthNotice.message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <p className="muted text-sm">
        Admins enable apps for the community. Each member connects their own
        account so agents act with that member&apos;s permissions. Shared
        secrets are optional and admin-only when enabled on a connector.
      </p>

      <div>
        <label className="label" htmlFor="connector-search">
          Search connectors
        </label>
        <input
          className="field"
          id="connector-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, e.g. Vercel, Slack, Drive…"
          autoComplete="off"
        />
      </div>

      {isAdmin ? (
        <section className="panel rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Popular apps</h2>
            <span className="muted text-sm">
              {filteredCatalog.length}
              {query.trim() ? ` of ${catalog.length}` : ""} apps
            </span>
          </div>
          {filteredCatalog.length === 0 ? (
            <p className="muted text-sm">No apps match “{query.trim()}”.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredCatalog.map((item) => {
                const already = enabledSlugs.has(item.slug);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-xl border p-4"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <ConnectorIcon icon={item.icon} name={item.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight">{item.name}</div>
                        <p className="muted mt-1 line-clamp-2 text-sm leading-snug">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      {already ? (
                        <span className="muted text-sm">Enabled</span>
                      ) : (
                        <form action={(fd) => run(enableCatalogAction, fd)}>
                          <input type="hidden" name="community_id" value={communityId} />
                          <input type="hidden" name="catalog_id" value={item.id} />
                          <button className="btn secondary" disabled={pending} type="submit">
                            Enable
                          </button>
                        </form>
                      )}
                      {item.docs_url ? (
                        <a
                          className="muted text-sm underline"
                          href={item.docs_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Docs
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="panel rounded-2xl p-5">
        <h2 className="mb-3 text-lg font-semibold">Enabled connectors</h2>
        {connectors.length === 0 ? (
          <p className="muted text-sm">No connectors enabled yet.</p>
        ) : filteredConnectors.length === 0 ? (
          <p className="muted text-sm">No enabled connectors match “{query.trim()}”.</p>
        ) : (
          <div className="space-y-6">
            {filteredConnectors.map((c) => {
              const connected = connectedIds.includes(c.id);
              const hasShared = sharedIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--line)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <ConnectorIcon
                        icon={c.catalog?.icon || c.slug}
                        name={c.name}
                      />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {c.name}{" "}
                          {!c.enabled ? (
                            <span className="muted text-xs">(disabled)</span>
                          ) : null}
                        </div>
                        <div className="muted break-all text-xs">{c.mcp_url}</div>
                        <div className="muted mt-1 text-xs">
                          Auth: {c.auth_type}
                          {connected ? " · Connected" : " · Not connected"}
                          {hasShared ? " · Shared secret set" : ""}
                        </div>
                      </div>
                    </div>
                    {isAdmin ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={(fd) => run(toggleAction, fd)}>
                          <input type="hidden" name="community_id" value={communityId} />
                          <input type="hidden" name="connector_id" value={c.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={c.enabled ? "false" : "true"}
                          />
                          <button className="btn secondary" type="submit" disabled={pending}>
                            {c.enabled ? "Disable" : "Enable"}
                          </button>
                        </form>
                        {(c.auth_type === "bearer" || c.auth_type === "oauth") ? (
                          <form action={(fd) => run(setSharedFlagAction, fd)}>
                            <input type="hidden" name="community_id" value={communityId} />
                            <input type="hidden" name="connector_id" value={c.id} />
                            <input
                              type="hidden"
                              name="allow_shared_secret"
                              value={c.allow_shared_secret ? "false" : "true"}
                            />
                            <button className="btn secondary" type="submit" disabled={pending}>
                              {c.allow_shared_secret
                                ? "Disallow shared secret"
                                : "Allow shared secret"}
                            </button>
                          </form>
                        ) : null}
                        <form action={(fd) => run(deleteAction, fd)}>
                          <input type="hidden" name="community_id" value={communityId} />
                          <input type="hidden" name="connector_id" value={c.id} />
                          <button className="btn secondary" type="submit" disabled={pending}>
                            Remove
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {c.auth_type === "oauth" ? (
                      <a
                        className="btn secondary"
                        href={`/api/connectors/oauth/start?connector_id=${c.id}&community_slug=${encodeURIComponent(communitySlug)}`}
                      >
                        Connect with OAuth
                      </a>
                    ) : null}
                    {c.auth_type === "none" && !connected ? (
                      <form action={(fd) => run(connectNoneAction, fd)}>
                        <input type="hidden" name="community_id" value={communityId} />
                        <input type="hidden" name="connector_id" value={c.id} />
                        <button className="btn secondary" type="submit" disabled={pending}>
                          Enable for me
                        </button>
                      </form>
                    ) : null}
                    {connected ? (
                      <form action={(fd) => run(disconnectAction, fd)}>
                        <input type="hidden" name="community_id" value={communityId} />
                        <input type="hidden" name="connector_id" value={c.id} />
                        <input type="hidden" name="is_shared" value="false" />
                        <button className="btn secondary" type="submit" disabled={pending}>
                          Disconnect
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {(c.auth_type === "bearer" || c.auth_type === "oauth") && (
                    <form
                      className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]"
                      action={(fd) => run(connectBearerAction, fd)}
                    >
                      <input type="hidden" name="community_id" value={communityId} />
                      <input type="hidden" name="connector_id" value={c.id} />
                      <input
                        className="field"
                        name="access_token"
                        type="password"
                        placeholder={
                          c.auth_type === "oauth"
                            ? "Or paste API / access token"
                            : "API / access token"
                        }
                        autoComplete="off"
                        required
                      />
                      <button className="btn" type="submit" disabled={pending}>
                        Save token
                      </button>
                      {isAdmin && c.allow_shared_secret ? (
                        <label className="flex items-center gap-2 text-sm md:col-span-2">
                          <input type="checkbox" name="is_shared" />
                          Save as community shared secret
                        </label>
                      ) : null}
                    </form>
                  )}

                  {isAdmin && hasShared ? (
                    <form className="mt-2" action={(fd) => run(disconnectAction, fd)}>
                      <input type="hidden" name="community_id" value={communityId} />
                      <input type="hidden" name="connector_id" value={c.id} />
                      <input type="hidden" name="is_shared" value="true" />
                      <button className="btn secondary" type="submit" disabled={pending}>
                        Remove shared secret
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin ? (
        <section className="panel rounded-2xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Add custom MCP</h2>
          <form
            className="stack"
            action={(fd) => run(addCustomAction, fd)}
          >
            <input type="hidden" name="community_id" value={communityId} />
            <div>
              <label className="label" htmlFor="custom-name">
                Name
              </label>
              <input className="field" id="custom-name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="custom-url">
                MCP URL (HTTPS)
              </label>
              <input
                className="field"
                id="custom-url"
                name="mcp_url"
                placeholder="https://example.com/mcp"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="custom-auth">
                Auth
              </label>
              <select className="field" id="custom-auth" name="auth_type" defaultValue="bearer">
                <option value="bearer">Bearer token</option>
                <option value="oauth">OAuth</option>
                <option value="none">None</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="allow_shared_secret" />
              Allow community shared secret
            </label>
            <button className="btn" type="submit" disabled={pending}>
              Add connector
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

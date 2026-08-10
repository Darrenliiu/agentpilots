"use client";

import { useCallback, useEffect, useState } from "react";
import type { DesktopCliBridge, DesktopCliBridgeStatus } from "@/types/desktop";

async function loadCliStatus(): Promise<DesktopCliBridgeStatus> {
  if (typeof window !== "undefined" && window.agentpilots?.cli) {
    return window.agentpilots.cli.detect();
  }
  return {
    desktop: false,
    clis: [
      {
        id: "claude",
        label: "Claude Code CLI",
        provider: "claude-cli",
        installed: false,
        path: null,
        version: null,
        installUrl: "https://code.claude.com/docs/en/setup",
        installHint:
          "Install Claude Code, then run `claude` once and sign in.",
        loginHint: "Open a terminal and run: claude",
      },
      {
        id: "codex",
        label: "OpenAI Codex CLI",
        provider: "codex-cli",
        installed: false,
        path: null,
        version: null,
        installUrl: "https://developers.openai.com/codex/cli",
        installHint:
          "Install the Codex CLI, then run `codex` once and sign in.",
        loginHint: "Open a terminal and run: codex",
      },
    ],
  };
}

export function CliConnectPanel({
  provider,
}: {
  provider: "claude-cli" | "codex-cli";
}) {
  const [status, setStatus] = useState<DesktopCliBridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDesktop =
    typeof window !== "undefined" && Boolean(window.agentpilots);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await loadCliStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect CLI");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.agentpilots?.cli) return;
    return window.agentpilots.cli.onStatus((payload) => {
      setStatus(payload);
    });
  }, [refresh]);

  const cli: DesktopCliBridge | undefined = status?.clis.find(
    (c) => c.provider === provider,
  );

  async function openDocs() {
    if (!cli?.installUrl) return;
    if (window.agentpilots?.cli) {
      await window.agentpilots.cli.openInstall(cli.installUrl);
      return;
    }
    window.open(cli.installUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="form-section">
      <span className="form-section__legend">CLI connection</span>
      <p className="form-section__hint">
        Link the installed CLI instead of pasting an API key. AgentPilots runs
        prompts through the CLI using your existing login.
      </p>

      {!isDesktop ? (
        <p
          className="rounded-xl border px-3.5 py-3 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--field-bg)" }}
        >
          CLI linking works in AgentPilots Desktop. On the web, use an API key
          provider, or open Desktop to detect Claude Code / Codex.
        </p>
      ) : null}

      <div
        className="mt-3 rounded-xl border p-4 text-sm"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">{cli?.label || "CLI"}</div>
            <p className="muted mt-1">
              {cli?.installed
                ? `Detected${cli.version ? ` · ${cli.version}` : ""}${
                    cli.path ? ` · ${cli.path}` : ""
                  }`
                : "Not detected on this machine"}
            </p>
          </div>
          <button
            type="button"
            className="btn secondary compact"
            disabled={busy || !isDesktop}
            onClick={() => void refresh()}
          >
            {busy ? "Scanning…" : "Re-scan"}
          </button>
        </div>

        {error ? (
          <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        {cli?.installed ? (
          <p className="mt-3 text-sm" style={{ color: "var(--ok, #2f6b3a)" }}>
            Ready to link. Save this agent — no API key needed.
          </p>
        ) : (
          <ol className="muted mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              Install {cli?.label || "the CLI"} from the official guide.
              <button
                type="button"
                className="btn secondary compact ml-2 align-baseline"
                onClick={() => void openDocs()}
              >
                Open install guide
              </button>
            </li>
            <li>{cli?.installHint}</li>
            <li>
              Sign in once in a terminal ({cli?.loginHint || "run the CLI"}).
            </li>
            <li>Return here and click Re-scan.</li>
          </ol>
        )}
      </div>
    </div>
  );
}

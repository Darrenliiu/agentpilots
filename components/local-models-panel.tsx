"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  LocalLlmBridgeStatus,
  LocalModelBridge,
} from "@/types/desktop";

async function fetchStatus(): Promise<LocalLlmBridgeStatus> {
  if (typeof window !== "undefined" && window.agentpilots?.models) {
    return window.agentpilots.models.status();
  }
  const res = await fetch("/api/local-models", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load local models");
  return res.json();
}

function formatBytes(n: number) {
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function LocalModelsPanel({
  hideHeader = false,
}: {
  hideHeader?: boolean;
}) {
  const [status, setStatus] = useState<LocalLlmBridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isDesktop = typeof window !== "undefined" && Boolean(window.agentpilots);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchStatus();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.agentpilots?.models) {
      const t = setInterval(() => void refresh(), 4000);
      return () => clearInterval(t);
    }
    const offStatus = window.agentpilots.models.onStatus((payload) => {
      setStatus(payload);
    });
    const offProgress = window.agentpilots.models.onDownloadProgress(() => {
      void refresh();
    });
    return () => {
      offStatus();
      offProgress();
    };
  }, [refresh]);

  async function activate(id: string) {
    if (!window.agentpilots?.models) {
      setError("Switching models requires the desktop app");
      return;
    }
    setBusyId(id);
    try {
      const next = await window.agentpilots.models.setActive(id);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate model");
    } finally {
      setBusyId(null);
    }
  }

  async function download(id: string) {
    if (!window.agentpilots?.models) {
      setError("Downloading models requires the desktop app");
      return;
    }
    setBusyId(id);
    try {
      await window.agentpilots.models.download(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    await window.agentpilots?.models.cancelDownload(id);
    await refresh();
  }

  const models = status?.models || [];
  const installed = models.filter((m) => m.installed);
  const available = models.filter((m) => !m.installed);

  return (
    <div className="stack">
      {!hideHeader ? (
        <div>
          <h1 className="brand text-3xl">Local models</h1>
          <p className="muted mt-2 max-w-2xl text-sm">
            On-device LLMs powered by llama.cpp. Bundled small models are ready
            offline; larger models can be downloaded when you need more quality.
          </p>
        </div>
      ) : null}

      <div
        className="rounded-xl border p-4 text-sm"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="font-medium">Runtime</div>
        <p className="muted mt-1">
          {status?.ready
            ? `Ready · active ${status.activeModelId}`
            : status?.error || "Not ready"}
        </p>
        {!isDesktop ? (
          <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
            Open AgentPilots Desktop to start llama-server, activate models, and
            download GGUFs.
          </p>
        ) : null}
        {status && status.llamaBinaryPresent === false ? (
          <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
            llama-server binary missing. Run{" "}
            <code>npm run desktop:fetch-runtime</code>.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <section className="stack">
        <h2 className="text-lg font-semibold">Installed</h2>
        {installed.length === 0 ? (
          <p className="muted text-sm">No models installed yet.</p>
        ) : (
          <ul className="stack">
            {installed.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                busy={busyId === m.id}
                onActivate={() => void activate(m.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2 className="text-lg font-semibold">Available to download</h2>
        {available.length === 0 ? (
          <p className="muted text-sm">All catalog models are installed.</p>
        ) : (
          <ul className="stack">
            {available.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                busy={busyId === m.id}
                onDownload={() => void download(m.id)}
                onCancel={() => void cancel(m.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ModelRow({
  model,
  busy,
  onActivate,
  onDownload,
  onCancel,
}: {
  model: LocalModelBridge;
  busy?: boolean;
  onActivate?: () => void;
  onDownload?: () => void;
  onCancel?: () => void;
}) {
  return (
    <li
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">
            {model.label}
            {model.active ? (
              <span className="muted ml-2 text-xs uppercase tracking-wide">
                active
              </span>
            ) : null}
            {model.bundled ? (
              <span className="muted ml-2 text-xs uppercase tracking-wide">
                bundled
              </span>
            ) : null}
          </div>
          <p className="muted mt-1 text-sm">
            {model.description || model.filename} · {formatBytes(model.sizeBytes)}{" "}
            · needs ~{model.minRamGb} GB RAM · {model.license}
          </p>
          {!model.canFit ? (
            <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>
              This machine may not have enough RAM for this model.
            </p>
          ) : null}
          {model.download.inProgress ? (
            <div className="mt-2">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: "var(--line)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${model.download.percent}%`,
                    background: "var(--accent, #2563eb)",
                  }}
                />
              </div>
              <p className="muted mt-1 text-xs">{model.download.percent}%</p>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {model.installed && onActivate && !model.active ? (
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={onActivate}
            >
              {busy ? "Switching…" : "Activate"}
            </button>
          ) : null}
          {!model.installed && model.download.inProgress && onCancel ? (
            <button className="btn secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          {!model.installed && !model.download.inProgress && onDownload ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={onDownload}
            >
              {busy ? "Starting…" : "Download"}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

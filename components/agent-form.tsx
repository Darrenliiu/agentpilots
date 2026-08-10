"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import {
  MEDIA_PROVIDERS,
  TEXT_PROVIDERS,
  type Agent,
  type Channel,
} from "@/lib/types";
import type { LocalModelBridge } from "@/types/desktop";

function CheckTile({
  name,
  value,
  defaultChecked,
  label,
  meta,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  label: string;
  meta?: string;
}) {
  return (
    <label className="check-tile">
      <input
        className="sr-only"
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
      />
      <span className="check-tile__box" aria-hidden />
      <span className="check-tile__label">
        {label}
        {meta ? <span className="check-tile__meta">{meta}</span> : null}
      </span>
    </label>
  );
}

export function AgentForm({
  communityId,
  channels,
  agent,
  selectedChannelIds = [],
  connectors = [],
  skills = [],
  selectedConnectorIds = [],
  selectedSkillIds = [],
  peerAgents = [],
  selectedHandoffTargetIds = [],
  action,
}: {
  communityId: string;
  channels: Channel[];
  agent?: Agent;
  selectedChannelIds?: string[];
  connectors?: { id: string; name: string; enabled: boolean }[];
  skills?: { id: string; name: string; enabled: boolean }[];
  selectedConnectorIds?: string[];
  selectedSkillIds?: string[];
  peerAgents?: { id: string; name: string; status: string }[];
  selectedHandoffTargetIds?: string[];
  action: (
    communityId: string,
    formData: FormData,
  ) => Promise<{ error?: string } | void>;
}) {
  const [kind, setKind] = useState(agent?.kind || "text");
  const [provider, setProvider] = useState(
    agent?.provider || (agent?.kind === "text" ? "local" : "openai"),
  );
  const [status, setStatus] = useState(agent?.status || "active");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [localModels, setLocalModels] = useState<LocalModelBridge[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    agent?.avatar_url || null,
  );
  const [handoffEnabled, setHandoffEnabled] = useState(
    Boolean(agent?.handoff_enabled),
  );
  const [handoffUnlimited, setHandoffUnlimited] = useState(
    agent?.handoff_max_depth == null,
  );

  const providers = useMemo(() => {
    if (kind === "text") return TEXT_PROVIDERS;
    if (kind === "video") {
      return MEDIA_PROVIDERS.filter((p) => p.id !== "google");
    }
    return MEDIA_PROVIDERS;
  }, [kind]);

  const modelPlaceholder = useMemo(() => {
    if (kind === "video") {
      if (provider === "higgsfield") return "higgsfield-ai/dop/standard";
      return "sora-2";
    }
    if (kind === "image") {
      if (provider === "google") return "gemini-2.0-flash-preview-image-generation";
      if (provider === "higgsfield") return "gpt-image-2";
      return "dall-e-3";
    }
    return "gpt-4o-mini";
  }, [kind, provider]);

  const isLocal = kind === "text" && provider === "local";
  const formId = agent?.id || "new";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (window.agentpilots?.models) {
          const list = await window.agentpilots.models.list();
          if (!cancelled) setLocalModels(list.filter((m) => m.installed));
          return;
        }
        const res = await fetch("/api/local-models", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setLocalModels(
            (data.models || []).filter((m: LocalModelBridge) => m.installed),
          );
        }
      } catch {
        // ignore — cloud form still works
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <form
      className="stack gap-4"
      action={(fd) => {
        start(async () => {
          const res = await action(communityId, fd);
          if (res && "error" in res && res.error) setError(res.error);
        });
      }}
    >
      {agent ? <input type="hidden" name="id" value={agent.id} /> : null}

      <div className="form-section">
        <div className="flex items-center gap-4">
          <Avatar src={avatarPreview} name={agent?.name || "New agent"} size={56} />
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor={`avatar-${formId}`}>
              Avatar
            </label>
            <input
              className="field"
              id={`avatar-${formId}`}
              name="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAvatarPreview(URL.createObjectURL(file));
              }}
            />
            <p className="muted mt-1 text-xs">
              Optional · PNG, JPG, WebP, or GIF · max 2MB
            </p>
          </div>
        </div>
      </div>

      <div className="form-section">
        <span className="form-section__legend">Identity</span>
        <p className="form-section__hint">
          Name the agent and choose how it generates replies.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label" htmlFor={`name-${formId}`}>
              Name
            </label>
            <input
              className="field"
              id={`name-${formId}`}
              name="name"
              required
              defaultValue={agent?.name}
              placeholder="ResearchBot"
            />
          </div>
          <div className="md:col-span-2">
            <span className="label">Kind</span>
            <div className="segmented" role="radiogroup" aria-label="Agent kind">
              {(
                [
                  { value: "text", label: "Text LLM" },
                  { value: "image", label: "Image gen" },
                  { value: "video", label: "Video gen" },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="segmented__option">
                  <input
                    className="sr-only"
                    type="radio"
                    name="kind"
                    value={opt.value}
                    checked={kind === opt.value}
                    onChange={() => {
                      const next = opt.value;
                      setKind(next);
                      if (next !== "text" && provider === "local") {
                        setProvider("openai");
                      }
                      if (next === "video" && provider === "google") {
                        setProvider("openai");
                      }
                      if (next === "text" && !agent) setProvider("local");
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`provider-${formId}`}>
              Provider
            </label>
            <select
              className="field"
              id={`provider-${formId}`}
              name="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {providers.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={"disabled" in p ? Boolean(p.disabled) : false}
                >
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`model-${formId}`}>
              Model
            </label>
            {isLocal ? (
              <select
                className="field"
                id={`model-${formId}`}
                name="model"
                defaultValue={
                  agent?.model || localModels[0]?.id || "qwen2.5-1.5b-instruct"
                }
                required
              >
                {localModels.length === 0 ? (
                  <option value="qwen2.5-1.5b-instruct">
                    qwen2.5-1.5b-instruct (install via Local models)
                  </option>
                ) : (
                  localModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.active ? " (active runtime)" : ""}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <input
                className="field"
                id={`model-${formId}`}
                name="model"
                defaultValue={agent?.model}
                placeholder={modelPlaceholder}
              />
            )}
          </div>
        </div>
      </div>

      <div className="form-section">
        <label className="form-section__legend" htmlFor={`prompt-${formId}`}>
          System prompt
        </label>
        <p className="form-section__hint">
          Instructions that shape this agent&apos;s tone and behavior.
        </p>
        <textarea
          className="field min-h-[90px]"
          id={`prompt-${formId}`}
          name="system_prompt"
          defaultValue={agent?.system_prompt}
          placeholder="You are a helpful research agent for this community."
        />
      </div>

      {!isLocal ? (
        <div className="form-section">
          <span className="form-section__legend">Credentials</span>
          <p className="form-section__hint">
            API access for the selected cloud provider.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor={`key-${formId}`}>
                API key {agent ? "(leave blank to keep existing)" : ""}
              </label>
              <input
                className="field"
                id={`key-${formId}`}
                name="api_key"
                type="password"
                autoComplete="off"
                required={!agent}
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="label" htmlFor={`base-${formId}`}>
                Base URL (OpenAI-compatible / Cursor gateway)
              </label>
              <input
                className="field"
                id={`base-${formId}`}
                name="base_url"
                placeholder="https://api.example.com/v1"
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="muted rounded-xl border px-3.5 py-3 text-sm" style={{ borderColor: "var(--line)", background: "var(--field-bg)" }}>
          Local agents use the on-device llama.cpp runtime. Manage downloads and
          the active GGUF under Local models.
        </p>
      )}

      <div className="form-section">
        <span className="form-section__legend">Status</span>
        <p className="form-section__hint">
          Disabled agents stay configured but won&apos;t respond.
        </p>
        <div className="segmented max-w-sm" role="radiogroup" aria-label="Agent status">
          {(
            [
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className="segmented__option">
              <input
                className="sr-only"
                type="radio"
                name="status"
                value={opt.value}
                checked={status === opt.value}
                onChange={() => setStatus(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <fieldset className="form-section">
        <legend className="form-section__legend">Channels this agent can join</legend>
        <p className="form-section__hint">
          Pick the spaces where this agent is allowed to participate.
        </p>
        {channels.length === 0 ? (
          <p className="muted text-sm">No channels yet.</p>
        ) : (
          <div className="check-grid">
            {channels.map((ch) => (
              <CheckTile
                key={ch.id}
                name="channel_ids"
                value={ch.id}
                defaultChecked={selectedChannelIds.includes(ch.id)}
                label={`#${ch.name}`}
              />
            ))}
          </div>
        )}
      </fieldset>

      {connectors.length > 0 ? (
        <fieldset className="form-section">
          <legend className="form-section__legend">Default connectors</legend>
          <p className="form-section__hint">
            Used when the chat message does not attach connectors via +.
          </p>
          <div className="check-grid">
            {connectors
              .filter((c) => c.enabled)
              .map((c) => (
                <CheckTile
                  key={c.id}
                  name="connector_ids"
                  value={c.id}
                  defaultChecked={selectedConnectorIds.includes(c.id)}
                  label={c.name}
                />
              ))}
          </div>
        </fieldset>
      ) : null}

      {skills.length > 0 ? (
        <fieldset className="form-section">
          <legend className="form-section__legend">Default skills</legend>
          <p className="form-section__hint">
            Used when the chat message does not attach skills via +.
          </p>
          <div className="check-grid">
            {skills
              .filter((s) => s.enabled)
              .map((s) => (
                <CheckTile
                  key={s.id}
                  name="skill_ids"
                  value={s.id}
                  defaultChecked={selectedSkillIds.includes(s.id)}
                  label={s.name}
                />
              ))}
          </div>
        </fieldset>
      ) : null}

      {kind === "text" ? (
        <fieldset className="form-section">
          <legend className="form-section__legend">Hand Off</legend>
          <p className="form-section__hint">
            Let this agent tag another agent with @Name so they can continue the
            work in-channel.
          </p>

          <label className="switch-row">
            <span className="switch-row__copy">
              <span className="switch-row__title">Enable hand off</span>
              <span className="switch-row__hint">
                Allow this agent to pass work to selected peers.
              </span>
            </span>
            <input
              className="sr-only"
              type="checkbox"
              name="handoff_enabled"
              value="true"
              checked={handoffEnabled}
              onChange={(e) => setHandoffEnabled(e.target.checked)}
            />
            <span className="switch" aria-hidden />
          </label>

          {handoffEnabled ? (
            <div className="mt-3 space-y-3">
              <div>
                <p className="label mb-2">Agents this one may hand off to</p>
                {peerAgents.length === 0 ? (
                  <p className="muted text-xs">
                    Create another agent in this community to allow hand offs.
                  </p>
                ) : (
                  <div className="check-grid">
                    {peerAgents.map((peer) => (
                      <CheckTile
                        key={peer.id}
                        name="handoff_target_ids"
                        value={peer.id}
                        defaultChecked={selectedHandoffTargetIds.includes(
                          peer.id,
                        )}
                        label={peer.name}
                        meta={
                          peer.status !== "active" ? "Disabled" : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              <details className="form-details">
                <summary>Advanced</summary>
                <div className="form-details__body mt-3 space-y-3">
                  <label className="switch-row">
                    <span className="switch-row__copy">
                      <span className="switch-row__title">
                        Unlimited chain depth
                      </span>
                      <span className="switch-row__hint">
                        Allow any number of agent→agent hops.
                      </span>
                    </span>
                    <input
                      className="sr-only"
                      type="checkbox"
                      name="handoff_unlimited"
                      value="true"
                      checked={handoffUnlimited}
                      onChange={(e) => setHandoffUnlimited(e.target.checked)}
                    />
                    <span className="switch" aria-hidden />
                  </label>

                  {!handoffUnlimited ? (
                    <div>
                      <label
                        className="label"
                        htmlFor={`handoff-depth-${formId}`}
                      >
                        Max chain depth
                      </label>
                      <input
                        className="field"
                        id={`handoff-depth-${formId}`}
                        name="handoff_max_depth"
                        type="number"
                        min={1}
                        defaultValue={agent?.handoff_max_depth ?? 3}
                      />
                      <p className="muted mt-1 text-xs">
                        Number of agent→agent hops allowed after a human
                        message.
                      </p>
                    </div>
                  ) : null}

                  <label className="switch-row">
                    <span className="switch-row__copy">
                      <span className="switch-row__title">
                        Block cycles
                      </span>
                      <span className="switch-row__hint">
                        Same agent cannot appear more than once in a chain.
                      </span>
                    </span>
                    <input
                      className="sr-only"
                      type="checkbox"
                      name="handoff_block_cycles"
                      value="true"
                      defaultChecked={agent?.handoff_block_cycles !== false}
                    />
                    <span className="switch" aria-hidden />
                  </label>

                  <label className="switch-row">
                    <span className="switch-row__copy">
                      <span className="switch-row__title">
                        Prompt assist
                      </span>
                      <span className="switch-row__hint">
                        Auto-add hand off instructions to the system prompt.
                      </span>
                    </span>
                    <input
                      className="sr-only"
                      type="checkbox"
                      name="handoff_prompt_assist"
                      value="true"
                      defaultChecked={agent?.handoff_prompt_assist !== false}
                    />
                    <span className="switch" aria-hidden />
                  </label>
                </div>
              </details>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <button className="btn w-full" disabled={pending} type="submit">
        {pending ? "Saving…" : agent ? "Update agent" : "Create agent"}
      </button>
    </form>
  );
}

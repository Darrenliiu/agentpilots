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

  const providers = useMemo(
    () => (kind === "text" ? TEXT_PROVIDERS : MEDIA_PROVIDERS),
    [kind],
  );

  const isLocal = kind === "text" && provider === "local";

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
      className="stack"
      action={(fd) => {
        start(async () => {
          const res = await action(communityId, fd);
          if (res && "error" in res && res.error) setError(res.error);
        });
      }}
    >
      {agent ? <input type="hidden" name="id" value={agent.id} /> : null}

      <div className="flex items-center gap-4">
        <Avatar src={avatarPreview} name={agent?.name || "New agent"} size={56} />
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor={`avatar-${agent?.id || "new"}`}>
            Avatar
          </label>
          <input
            className="field"
            id={`avatar-${agent?.id || "new"}`}
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

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor={`name-${agent?.id || "new"}`}>
            Name
          </label>
          <input
            className="field"
            id={`name-${agent?.id || "new"}`}
            name="name"
            required
            defaultValue={agent?.name}
            placeholder="ResearchBot"
          />
        </div>
        <div>
          <label className="label" htmlFor={`kind-${agent?.id || "new"}`}>
            Kind
          </label>
          <select
            className="field"
            id={`kind-${agent?.id || "new"}`}
            name="kind"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as Agent["kind"];
              setKind(next);
              if (next !== "text" && provider === "local") setProvider("openai");
              if (next === "text" && !agent) setProvider("local");
            }}
          >
            <option value="text">Text LLM</option>
            <option value="image">Image gen</option>
            <option value="video">Video gen</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`provider-${agent?.id || "new"}`}>
            Provider
          </label>
          <select
            className="field"
            id={`provider-${agent?.id || "new"}`}
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
          <label className="label" htmlFor={`model-${agent?.id || "new"}`}>
            Model
          </label>
          {isLocal ? (
            <select
              className="field"
              id={`model-${agent?.id || "new"}`}
              name="model"
              defaultValue={agent?.model || localModels[0]?.id || "qwen2.5-1.5b-instruct"}
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
              id={`model-${agent?.id || "new"}`}
              name="model"
              defaultValue={agent?.model}
              placeholder="gpt-4o-mini"
            />
          )}
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`prompt-${agent?.id || "new"}`}>
          System prompt
        </label>
        <textarea
          className="field min-h-[90px]"
          id={`prompt-${agent?.id || "new"}`}
          name="system_prompt"
          defaultValue={agent?.system_prompt}
          placeholder="You are a helpful research agent for this community."
        />
      </div>

      {!isLocal ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor={`key-${agent?.id || "new"}`}>
              API key {agent ? "(leave blank to keep existing)" : ""}
            </label>
            <input
              className="field"
              id={`key-${agent?.id || "new"}`}
              name="api_key"
              type="password"
              autoComplete="off"
              required={!agent}
              placeholder="sk-..."
            />
          </div>
          <div>
            <label className="label" htmlFor={`base-${agent?.id || "new"}`}>
              Base URL (OpenAI-compatible / Cursor gateway)
            </label>
            <input
              className="field"
              id={`base-${agent?.id || "new"}`}
              name="base_url"
              placeholder="https://api.example.com/v1"
            />
          </div>
        </div>
      ) : (
        <p className="muted text-sm">
          Local agents use the on-device llama.cpp runtime. Manage downloads and
          the active GGUF under Local models.
        </p>
      )}

      <div>
        <label className="label" htmlFor={`status-${agent?.id || "new"}`}>
          Status
        </label>
        <select
          className="field"
          id={`status-${agent?.id || "new"}`}
          name="status"
          defaultValue={agent?.status || "active"}
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      <fieldset>
        <legend className="label">Channels this agent can join</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {channels.map((ch) => (
            <label key={ch.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="channel_ids"
                value={ch.id}
                defaultChecked={selectedChannelIds.includes(ch.id)}
              />
              #{ch.name}
            </label>
          ))}
        </div>
      </fieldset>

      {connectors.length > 0 ? (
        <fieldset>
          <legend className="label">Default connectors</legend>
          <p className="muted mb-2 text-xs">
            Used when the chat message does not attach connectors via +.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {connectors
              .filter((c) => c.enabled)
              .map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="connector_ids"
                    value={c.id}
                    defaultChecked={selectedConnectorIds.includes(c.id)}
                  />
                  {c.name}
                </label>
              ))}
          </div>
        </fieldset>
      ) : null}

      {skills.length > 0 ? (
        <fieldset>
          <legend className="label">Default skills</legend>
          <p className="muted mb-2 text-xs">
            Used when the chat message does not attach skills via +.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {skills
              .filter((s) => s.enabled)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="skill_ids"
                    value={s.id}
                    defaultChecked={selectedSkillIds.includes(s.id)}
                  />
                  {s.name}
                </label>
              ))}
          </div>
        </fieldset>
      ) : null}

      {kind === "text" ? (
        <fieldset>
          <legend className="label">Hand Off</legend>
          <p className="muted mb-3 text-xs">
            Let this agent tag another agent with @Name so they can continue the
            work in-channel.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="handoff_enabled"
              value="true"
              checked={handoffEnabled}
              onChange={(e) => setHandoffEnabled(e.target.checked)}
            />
            Enable hand off
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    {peerAgents.map((peer) => (
                      <label
                        key={peer.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="handoff_target_ids"
                          value={peer.id}
                          defaultChecked={selectedHandoffTargetIds.includes(
                            peer.id,
                          )}
                        />
                        {peer.name}
                        {peer.status !== "active" ? (
                          <span className="muted text-xs">(disabled)</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <details className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                <summary className="cursor-pointer text-sm font-medium">
                  Advanced
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="handoff_unlimited"
                      value="true"
                      checked={handoffUnlimited}
                      onChange={(e) => setHandoffUnlimited(e.target.checked)}
                    />
                    Unlimited chain depth
                  </label>
                  {!handoffUnlimited ? (
                    <div>
                      <label
                        className="label"
                        htmlFor={`handoff-depth-${agent?.id || "new"}`}
                      >
                        Max chain depth
                      </label>
                      <input
                        className="field"
                        id={`handoff-depth-${agent?.id || "new"}`}
                        name="handoff_max_depth"
                        type="number"
                        min={1}
                        defaultValue={agent?.handoff_max_depth ?? 3}
                      />
                      <p className="muted mt-1 text-xs">
                        Number of agent→agent hops allowed after a human message.
                      </p>
                    </div>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="handoff_block_cycles"
                      value="true"
                      defaultChecked={agent?.handoff_block_cycles !== false}
                    />
                    Block cycles (same agent more than once in a chain)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="handoff_prompt_assist"
                      value="true"
                      defaultChecked={agent?.handoff_prompt_assist !== false}
                    />
                    Auto-add hand off instructions to the system prompt
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

      <button className="btn" disabled={pending} type="submit">
        {pending ? "Saving…" : agent ? "Update agent" : "Create agent"}
      </button>
    </form>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { linkAgentsHandoffAction } from "@/lib/actions";
import type { Agent } from "@/lib/types";

export type LinkableAgent = Pick<
  Agent,
  "id" | "name" | "kind" | "status" | "avatar_url"
>;

type Direction = "a_to_b" | "b_to_a" | "both";

export function LinkAgentsDialog({
  open,
  onClose,
  communityId,
  agents,
}: {
  open: boolean;
  onClose: () => void;
  communityId: string;
  agents: LinkableAgent[];
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const textAgents = useMemo(
    () => agents.filter((a) => a.kind === "text"),
    [agents],
  );

  const [agentAId, setAgentAId] = useState("");
  const [agentBId, setAgentBId] = useState("");
  const [direction, setDirection] = useState<Direction>("both");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDirection("both");
    const first = textAgents[0]?.id || "";
    const second = textAgents[1]?.id || "";
    setAgentAId(first);
    setAgentBId(second && second !== first ? second : "");
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, textAgents]);

  const agentA = textAgents.find((a) => a.id === agentAId);
  const agentB = textAgents.find((a) => a.id === agentBId);

  if (!open) return null;

  function submit() {
    setError(null);
    start(async () => {
      const res = await linkAgentsHandoffAction({
        communityId,
        agentAId,
        agentBId,
        direction,
      });
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="panel relative z-10 w-full max-w-md overflow-auto rounded-2xl p-6 shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="brand text-2xl">
              Link agents
            </h2>
            <p className="muted mt-1 text-sm">
              Let two text agents hand work to each other with @mentions — without
              editing each agent separately.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn secondary shrink-0 !px-3 !py-1.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {textAgents.length < 2 ? (
          <p className="muted mt-5 text-sm">
            Create at least two text agents in this community to set up a hand
            off link.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <AgentSelect
                label="Agent A"
                value={agentAId}
                agents={textAgents}
                excludeId={agentBId}
                onChange={setAgentAId}
              />
              <AgentSelect
                label="Agent B"
                value={agentBId}
                agents={textAgents}
                excludeId={agentAId}
                onChange={setAgentBId}
              />
            </div>

            <fieldset>
              <legend className="label mb-2">Direction</legend>
              <div className="space-y-2">
                <DirectionOption
                  name="handoff-direction"
                  value="both"
                  checked={direction === "both"}
                  onChange={setDirection}
                  title="Both ways"
                  description={
                    agentA && agentB
                      ? `${agentA.name} ↔ ${agentB.name}`
                      : "Each can hand off to the other"
                  }
                />
                <DirectionOption
                  name="handoff-direction"
                  value="a_to_b"
                  checked={direction === "a_to_b"}
                  onChange={setDirection}
                  title="A → B only"
                  description={
                    agentA && agentB
                      ? `${agentA.name} can hand off to ${agentB.name}`
                      : "Agent A can hand off to Agent B"
                  }
                />
                <DirectionOption
                  name="handoff-direction"
                  value="b_to_a"
                  checked={direction === "b_to_a"}
                  onChange={setDirection}
                  title="B → A only"
                  description={
                    agentA && agentB
                      ? `${agentB.name} can hand off to ${agentA.name}`
                      : "Agent B can hand off to Agent A"
                  }
                />
              </div>
            </fieldset>

            <p className="muted text-xs">
              This turns Hand Off on for the sending agent(s) and adds the other
              to their allowlist. Existing hand off targets are kept.
            </p>

            {error ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn secondary"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={submit}
                disabled={pending || !agentAId || !agentBId}
              >
                {pending ? "Linking…" : "Link agents"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentSelect({
  label,
  value,
  agents,
  excludeId,
  onChange,
}: {
  label: string;
  value: string;
  agents: LinkableAgent[];
  excludeId?: string;
  onChange: (id: string) => void;
}) {
  const selected = agents.find((a) => a.id === value);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        {selected ? (
          <Avatar src={selected.avatar_url} name={selected.name} size={28} />
        ) : (
          <span
            className="inline-block size-7 rounded-full"
            style={{ background: "var(--chip-bg)" }}
          />
        )}
        <select
          className="field min-w-0 flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {agents
            .filter((a) => a.id !== excludeId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.status !== "active" ? " (disabled)" : ""}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

function DirectionOption({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: Direction;
  checked: boolean;
  onChange: (value: Direction) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm"
      style={{
        borderColor: checked ? "var(--ink)" : "var(--line)",
        background: checked ? "var(--chip-bg)" : "transparent",
      }}
    >
      <input
        type="radio"
        className="mt-1"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="muted text-xs">{description}</span>
      </span>
    </label>
  );
}

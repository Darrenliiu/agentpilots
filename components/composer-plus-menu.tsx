"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_MESSAGE_ATTACHMENTS,
  isImageMime,
  resolveAttachmentMime,
  validateAttachmentFile,
} from "@/lib/message-attachments";
import { maxAttachmentBytes } from "@/lib/billing";
import type { Agent, CommunityConnector, Skill } from "@/lib/types";

export type ComposerPendingFile = {
  id: string;
  file: File;
  previewUrl?: string;
};

export type ComposerAttachment = {
  connectorIds: string[];
  skillIds: string[];
  imageAgentId: string | null;
  webSearch: boolean;
  files: ComposerPendingFile[];
};

export const DEFAULT_COMPOSER_ATTACHMENT: ComposerAttachment = {
  connectorIds: [],
  skillIds: [],
  imageAgentId: null,
  webSearch: true,
  files: [],
};

type MenuView = "root" | "image" | "skills" | "connectors";

function MenuIcon({
  kind,
}: {
  kind: "files" | "image" | "skills" | "connectors" | "search";
}) {
  if (kind === "files") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 7V4h11v16H5V7h3z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M8 7h3V4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M9 12h6M9 16h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "search") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M16 16l4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "image") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <path d="M4 16l5-4 3 2 4-5 4 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  if (kind === "skills") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 4h6a2 2 0 012 2v14l-3-2-3 2V6a2 2 0 00-2-2z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M13 4h6a2 2 0 012 2v14l-3-2-3 2V6a2 2 0 00-2-2z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 12h8M12 8v8M7 7l2 2M17 7l-2 2M7 17l2-2M17 17l-2-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function revokePreviews(files: ComposerPendingFile[]) {
  for (const f of files) {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  }
}

export function ComposerPlusMenu({
  agents,
  connectors,
  skills,
  connectedConnectorIds,
  communitySlug,
  communityPlan = "free",
  value,
  onChange,
}: {
  agents: Agent[];
  connectors: CommunityConnector[];
  skills: Skill[];
  connectedConnectorIds: string[];
  communitySlug: string;
  communityPlan?: string;
  value: ComposerAttachment;
  onChange: (next: ComposerAttachment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("root");
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaAgents = agents.filter(
    (a) => a.status === "active" && (a.kind === "image" || a.kind === "video"),
  );
  const enabledConnectors = connectors.filter((c) => c.enabled);
  const enabledSkills = skills.filter((s) => s.enabled);
  const connectedSet = new Set(connectedConnectorIds);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setView("root");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggleSkill(id: string) {
    const set = new Set(value.skillIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, skillIds: [...set] });
  }

  function toggleConnector(id: string) {
    if (!connectedSet.has(id)) return;
    const set = new Set(value.connectorIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, connectorIds: [...set] });
  }

  function selectImageAgent(id: string) {
    onChange({
      ...value,
      imageAgentId: value.imageAgentId === id ? null : id,
    });
    setOpen(false);
    setView("root");
  }

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const room = MAX_MESSAGE_ATTACHMENTS - value.files.length;
    if (room <= 0) {
      alert(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files`);
      return;
    }
    const nextFiles = [...value.files];
    for (const file of incoming.slice(0, room)) {
      const validated = validateAttachmentFile(
        file,
        maxAttachmentBytes(communityPlan),
      );
      if (!validated.ok) {
        alert(validated.error);
        continue;
      }
      const mime = resolveAttachmentMime(file);
      nextFiles.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: isImageMime(mime) ? URL.createObjectURL(file) : undefined,
      });
    }
    onChange({ ...value, files: nextFiles });
    setOpen(false);
    setView("root");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json,.md,.csv,.txt,.json,application/pdf"
        onChange={(e) => onPickFiles(e.target.files)}
      />
      <button
        type="button"
        className="composer-plus-btn"
        aria-label="Add attachment"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setView("root");
        }}
      >
        <span aria-hidden>+</span>
      </button>

      {open ? (
        <div
          className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border shadow-lg"
          style={{
            borderColor: "var(--line)",
            background: "var(--chip-bg)",
            color: "var(--ink)",
          }}
        >
          {view === "root" ? (
            <ul className="py-1 text-sm">
              <li>
                <button
                  type="button"
                  className="nav-hover flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <MenuIcon kind="files" />
                  <span className="flex-1">Add files or photos</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-hover flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => setView("image")}
                >
                  <MenuIcon kind="image" />
                  <span className="flex-1">Generate with…</span>
                  <span className="muted">›</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-hover flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => setView("skills")}
                >
                  <MenuIcon kind="skills" />
                  <span className="flex-1">Skills</span>
                  <span className="muted">›</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-hover flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => setView("connectors")}
                >
                  <MenuIcon kind="connectors" />
                  <span className="flex-1">Connectors</span>
                  <span className="muted">›</span>
                </button>
              </li>
              <li>
                <div
                  className="my-1 border-t"
                  style={{ borderColor: "var(--line)" }}
                />
              </li>
              <li>
                <button
                  type="button"
                  className="nav-hover flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() =>
                    onChange({ ...value, webSearch: !value.webSearch })
                  }
                >
                  <MenuIcon kind="search" />
                  <span className="flex-1">Web search</span>
                  {value.webSearch ? (
                    <span aria-label="Enabled" style={{ color: "var(--accent)" }}>
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            </ul>
          ) : null}

          {view === "image" ? (
            <div>
              <button
                type="button"
                className="muted w-full px-3 py-2 text-left text-xs"
                onClick={() => setView("root")}
              >
                ← Back
              </button>
              {mediaAgents.length === 0 ? (
                <p className="muted px-3 py-2 text-sm">
                  No image/video agents in this channel.
                </p>
              ) : (
                mediaAgents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="nav-hover flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                    onClick={() => selectImageAgent(a.id)}
                  >
                    <span>{a.name}</span>
                    <span className="muted text-xs capitalize">{a.kind}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {view === "skills" ? (
            <div className="max-h-64 overflow-y-auto">
              <button
                type="button"
                className="muted w-full px-3 py-2 text-left text-xs"
                onClick={() => setView("root")}
              >
                ← Back
              </button>
              {enabledSkills.length === 0 ? (
                <p className="muted px-3 py-2 text-sm">
                  No skills enabled.{" "}
                  <a
                    className="underline"
                    href={`/c/${communitySlug}/settings/skills`}
                  >
                    Add skills
                  </a>
                </p>
              ) : (
                enabledSkills.map((s) => (
                  <label
                    key={s.id}
                    className="nav-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={value.skillIds.includes(s.id)}
                      onChange={() => toggleSkill(s.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  </label>
                ))
              )}
            </div>
          ) : null}

          {view === "connectors" ? (
            <div className="max-h-64 overflow-y-auto">
              <button
                type="button"
                className="muted w-full px-3 py-2 text-left text-xs"
                onClick={() => setView("root")}
              >
                ← Back
              </button>
              {enabledConnectors.length === 0 ? (
                <p className="muted px-3 py-2 text-sm">
                  No connectors enabled.{" "}
                  <a
                    className="underline"
                    href={`/c/${communitySlug}/settings/connectors`}
                  >
                    Enable connectors
                  </a>
                </p>
              ) : (
                enabledConnectors.map((c) => {
                  const connected = connectedSet.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      {connected ? (
                        <label className="nav-hover flex flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={value.connectorIds.includes(c.id)}
                            onChange={() => toggleConnector(c.id)}
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      ) : (
                        <>
                          <span className="muted flex-1 truncate">{c.name}</span>
                          <a
                            className="text-xs underline"
                            href={`/c/${communitySlug}/settings/connectors`}
                          >
                            Connect
                          </a>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ComposerChips({
  agents,
  connectors,
  skills,
  value,
  onChange,
}: {
  agents: Agent[];
  connectors: CommunityConnector[];
  skills: Skill[];
  value: ComposerAttachment;
  onChange: (next: ComposerAttachment) => void;
}) {
  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  if (!value.webSearch) {
    chips.push({
      key: "web-search-off",
      label: "Web search off",
      onRemove: () => onChange({ ...value, webSearch: true }),
    });
  }

  if (value.imageAgentId) {
    const agent = agents.find((a) => a.id === value.imageAgentId);
    chips.push({
      key: `img-${value.imageAgentId}`,
      label: agent ? `Generate: ${agent.name}` : "Image agent",
      onRemove: () => onChange({ ...value, imageAgentId: null }),
    });
  }

  for (const id of value.skillIds) {
    const skill = skills.find((s) => s.id === id);
    chips.push({
      key: `skill-${id}`,
      label: skill ? `Skill: ${skill.name}` : "Skill",
      onRemove: () =>
        onChange({
          ...value,
          skillIds: value.skillIds.filter((x) => x !== id),
        }),
    });
  }

  for (const id of value.connectorIds) {
    const c = connectors.find((x) => x.id === id);
    chips.push({
      key: `conn-${id}`,
      label: c ? `Connector: ${c.name}` : "Connector",
      onRemove: () =>
        onChange({
          ...value,
          connectorIds: value.connectorIds.filter((x) => x !== id),
        }),
    });
  }

  const hasFiles = value.files.length > 0;
  if (!chips.length && !hasFiles) return null;

  return (
    <div className="mb-2 space-y-2">
      {hasFiles ? (
        <div className="flex flex-wrap gap-2">
          {value.files.map((f) => (
            <div
              key={f.id}
              className="composer-file-chip"
              title={f.file.name}
            >
              {f.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.previewUrl} alt="" className="composer-file-chip__thumb" />
              ) : (
                <span className="composer-file-chip__icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 4h7l5 5v11a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path d="M15 4v5h5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
              )}
              <span className="composer-file-chip__name">{f.file.name}</span>
              <button
                type="button"
                className="composer-file-chip__remove"
                aria-label={`Remove ${f.file.name}`}
                onClick={() => {
                  if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                  onChange({
                    ...value,
                    files: value.files.filter((x) => x.id !== f.id),
                  });
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {chips.length ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: "var(--line)" }}
              onClick={chip.onRemove}
              title="Remove"
            >
              {chip.label}
              <span className="muted" aria-hidden>
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function clearComposerAttachmentFiles(value: ComposerAttachment) {
  revokePreviews(value.files);
  return { ...value, files: [] as ComposerPendingFile[] };
}

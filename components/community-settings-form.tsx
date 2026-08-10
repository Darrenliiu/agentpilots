"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { useOptionalCommunityTheme } from "@/components/community-theme-shell";
import {
  COMMUNITY_THEMES,
  getCommunityTheme,
  type CommunityThemeId,
} from "@/lib/community-themes";
import type { Community } from "@/lib/types";

export function CommunitySettingsForm({
  community,
  canEdit,
  action,
}: {
  community: Community;
  canEdit: boolean;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const themeCtx = useOptionalCommunityTheme();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(community.avatar_url);
  const [themeId, setThemeId] = useState<CommunityThemeId>(
    getCommunityTheme(community.theme).id,
  );
  const [pending, start] = useTransition();

  function selectTheme(id: CommunityThemeId) {
    setThemeId(id);
    themeCtx?.setThemeId(id);
  }

  if (!canEdit) {
    const theme = getCommunityTheme(community.theme);
    return (
      <div className="stack">
        <div className="flex items-center gap-4">
          <Avatar src={community.avatar_url} name={community.name} size={72} />
          <div className="min-w-0">
            <div className="text-lg font-semibold">{community.name}</div>
            <div className="muted text-sm capitalize">
              {community.visibility}
              {community.discoverable ? " · Discoverable" : ""}
            </div>
          </div>
        </div>
        {community.description ? (
          <p className="text-sm">{community.description}</p>
        ) : (
          <p className="muted text-sm">No description yet.</p>
        )}
        <div>
          <div className="label">Theme</div>
          <div className="muted text-sm">{theme.label}</div>
        </div>
      </div>
    );
  }

  return (
    <form
      className="stack"
      action={(fd) => {
        start(async () => {
          // Keep the live preview while the server persists settings.
          themeCtx?.setThemeId(themeId);
          const res = await action(fd);
          if (res && "error" in res && res.error) setError(res.error);
          else setError(null);
        });
      }}
    >
      <input type="hidden" name="community_id" value={community.id} />

      <div className="flex items-center gap-4">
        <Avatar src={preview} name={community.name} size={72} />
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="community_avatar">
            Community photo
          </label>
          <input
            className="field"
            id="community_avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPreview(URL.createObjectURL(file));
            }}
          />
          <p className="muted mt-1 text-xs">PNG, JPG, WebP, or GIF · max 2MB</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="community_name">
          Name
        </label>
        <input
          className="field"
          id="community_name"
          name="name"
          required
          defaultValue={community.name}
        />
      </div>

      <div>
        <label className="label" htmlFor="community_description">
          Description
        </label>
        <textarea
          className="field min-h-24"
          id="community_description"
          name="description"
          defaultValue={community.description || ""}
          rows={3}
        />
      </div>

      <div>
        <label className="label" htmlFor="community_visibility">
          Visibility
        </label>
        <select
          className="field"
          id="community_visibility"
          name="visibility"
          defaultValue={community.visibility || "private"}
        >
          <option value="private">Private — invite only</option>
          <option value="public">Public — anyone can join</option>
        </select>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          className="mt-1"
          type="checkbox"
          name="discoverable"
          defaultChecked={community.discoverable}
        />
        <span>
          <span className="block text-sm font-semibold">Make community discoverable</span>
          <span className="muted text-sm">
            Show this community on the Discover page. Private communities still
            require an invite to join.
          </span>
        </span>
      </label>

      <fieldset>
        <legend className="label">Theme</legend>
        <p className="muted mb-3 text-sm">
          Choose a background and text color combination for this community.
          Preview updates instantly; click Save to keep it.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COMMUNITY_THEMES.map((theme) => {
            const selected = themeId === theme.id;
            return (
              <label
                key={theme.id}
                className="cursor-pointer rounded-xl border p-3 transition-shadow"
                style={{
                  borderColor: selected ? "var(--accent)" : "var(--line)",
                  boxShadow: selected
                    ? "0 0 0 1px var(--accent)"
                    : undefined,
                  background: "var(--panel)",
                }}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="theme"
                  value={theme.id}
                  checked={selected}
                  onChange={() => selectTheme(theme.id)}
                />
                <div
                  className="mb-2 flex h-14 overflow-hidden rounded-lg border"
                  style={{ borderColor: "var(--line)" }}
                  aria-hidden
                >
                  <div
                    className="flex flex-1 flex-col justify-between p-2"
                    style={{ background: theme.tokens["--bg"] }}
                  >
                    <span
                      className="text-xs font-semibold"
                      style={{ color: theme.tokens["--ink"] }}
                    >
                      Aa
                    </span>
                    <span
                      className="text-[10px]"
                      style={{ color: theme.tokens["--ink-muted"] }}
                    >
                      Text
                    </span>
                  </div>
                  <div
                    className="flex w-10 flex-col"
                    style={{ background: theme.tokens["--bg-deep"] }}
                  >
                    <span
                      className="mt-auto block h-3 w-full"
                      style={{ background: theme.tokens["--accent"] }}
                    />
                    <span
                      className="block h-2 w-full"
                      style={{ background: theme.tokens["--accent-2"] }}
                    />
                  </div>
                </div>
                <div className="text-sm font-semibold">{theme.label}</div>
                <div className="muted text-xs">{theme.description}</div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <button className="btn" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save community"}
      </button>
    </form>
  );
}

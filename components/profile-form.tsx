"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import type { Profile } from "@/lib/types";

export function ProfileForm({
  profile,
  action,
  next,
}: {
  profile: Profile;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  next?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(profile.avatar_url);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(fd) => {
        start(async () => {
          const res = await action(fd);
          if (res && "error" in res && res.error) setError(res.error);
          else setError(null);
        });
      }}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex items-center gap-4">
        <Avatar src={preview} name={profile.display_name} size={72} />
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="avatar">
            Profile photo
          </label>
          <input
            className="field"
            id="avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              setPreview(url);
            }}
          />
          <p className="muted mt-1 text-xs">PNG, JPG, WebP, or GIF · max 2MB</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="display_name">
          Display name
        </label>
        <input
          className="field"
          id="display_name"
          name="display_name"
          required
          defaultValue={profile.display_name}
        />
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <button className="btn" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

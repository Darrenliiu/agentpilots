"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { MessageMedia } from "@/components/message-media";
import type { CommunityMediaAssetRow } from "@/lib/community-media";

type LibraryAsset = CommunityMediaAssetRow;

export function CommunityLibrary({
  communitySlug,
  assets,
  agents,
}: {
  communitySlug: string;
  assets: LibraryAsset[];
  agents: { id: string; name: string }[];
}) {
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [preview, setPreview] = useState<LibraryAsset | null>(null);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (agentFilter !== "all" && a.agent_id !== agentFilter) return false;
      return true;
    });
  }, [assets, kindFilter, agentFilter]);

  function channelHref(asset: LibraryAsset) {
    const channel = asset.channel;
    if (!channel?.slug || !asset.message_id) return null;
    if (channel.type === "dm") {
      // DMs use opaque slugs; deep-link via channel slug still works in workspace routes.
      return `/c/${communitySlug}/${channel.slug}?m=${asset.message_id}`;
    }
    return `/c/${communitySlug}/${channel.slug}?m=${asset.message_id}`;
  }

  return (
    <div className="community-library">
      <header className="community-library__header">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
            Library
          </h1>
          <p className="muted mt-1 text-sm">
            Generated images and videos saved for everyone in this community.
          </p>
        </div>
        <div className="community-library__filters">
          <label className="community-library__filter">
            <span className="sr-only">Kind</span>
            <select
              className="field"
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(e.target.value as "all" | "image" | "video")
              }
            >
              <option value="all">All media</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          </label>
          <label className="community-library__filter">
            <span className="sr-only">Agent</span>
            <select
              className="field"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <option value="all">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="muted mt-8 text-sm">
          No generated media yet. Mention an image or video agent in a channel
          to create one.
        </p>
      ) : (
        <div className="community-library__grid">
          {filtered.map((asset) => {
            const jump = channelHref(asset);
            return (
              <article key={asset.id} className="community-library__card">
                <button
                  type="button"
                  className="community-library__thumb"
                  onClick={() => setPreview(asset)}
                  aria-label="Preview media"
                >
                  {asset.kind === "video" ? (
                    <video
                      src={asset.public_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="community-library__media"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.public_url}
                      alt={asset.prompt || "Generated media"}
                      className="community-library__media"
                    />
                  )}
                  <span className="community-library__kind">{asset.kind}</span>
                </button>
                <div className="community-library__meta">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={asset.agent?.avatar_url || null}
                      name={asset.agent?.name || "Agent"}
                      size={22}
                    />
                    <span className="truncate text-sm font-medium">
                      {asset.agent?.name || "Unknown agent"}
                    </span>
                  </div>
                  <p className="community-library__prompt" title={asset.prompt}>
                    {asset.prompt || "Untitled generation"}
                  </p>
                  <div className="muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span>
                      {format(new Date(asset.created_at), "MMM d, yyyy")}
                    </span>
                    {asset.model ? <span>· {asset.model}</span> : null}
                  </div>
                  <div className="community-library__card-actions">
                    <a
                      className="message-media__action"
                      href={asset.public_url}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="message-media__action"
                      onClick={() => setPreview(asset)}
                    >
                      Preview
                    </button>
                    {jump ? (
                      <Link className="message-media__action" href={jump}>
                        Jump to message
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {preview ? (
        <div
          className="message-media-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div
            className="message-media-lightbox__panel community-library__preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="message-media-lightbox__bar">
              <span className="message-media-lightbox__title">
                {preview.prompt || "Generated media"}
              </span>
              <button
                type="button"
                className="message-media__action"
                onClick={() => setPreview(null)}
              >
                Close
              </button>
            </div>
            <MessageMedia
              url={preview.public_url}
              mime={preview.mime}
              kind={preview.kind}
              alt={preview.prompt || "Generated media"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

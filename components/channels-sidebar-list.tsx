"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChannelActivityBadge } from "@/components/channel-activity-popover";
import {
  SidebarPlusButton,
  SidebarSectionHeader,
} from "@/components/sidebar-section-header";
import { useAgentActivity } from "@/hooks/use-agent-activity";
import { createChannelAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";

export type SidebarChannel = {
  id: string;
  name: string;
  slug: string;
  type: string;
};

export function ChannelsSidebarList({
  communityId,
  communitySlug,
  channels: initialChannels,
}: {
  communityId: string;
  communitySlug: string;
  channels: SidebarChannel[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [channels, setChannels] = useState(initialChannels);
  const [createOpen, setCreateOpen] = useState(false);
  const { byChannel, now } = useAgentActivity({ communityId });

  useEffect(() => {
    setChannels(initialChannels);
  }, [initialChannels]);

  useEffect(() => {
    const refetch = async () => {
      const { data } = await supabase
        .from("channels")
        .select("id, name, slug, type")
        .eq("community_id", communityId)
        .neq("type", "dm")
        .order("name");
      if (data) setChannels(data);
    };

    const channel = supabase
      .channel(`channels:community:${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channels",
          filter: `community_id=eq.${communityId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, supabase]);

  return (
    <div>
      <SidebarSectionHeader
        label="Channels"
        action={
          <SidebarPlusButton
            label="New channel"
            onClick={() => setCreateOpen(true)}
          />
        }
      />
      <ul className="space-y-0.5">
        {channels.map((ch) => {
          const activeRuns = byChannel.get(ch.id) || [];
          return (
            <li key={ch.id}>
              <Link
                href={`/c/${communitySlug}/${ch.slug}`}
                className="nav-hover flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium leading-snug"
              >
                <span className="min-w-0 flex-1 truncate"># {ch.name}</span>
                {activeRuns.length ? (
                  <ChannelActivityBadge runs={activeRuns} now={now} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <CreateChannelDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        communityId={communityId}
      />
    </div>
  );
}

function CreateChannelDialog({
  open,
  onClose,
  communityId,
}: {
  open: boolean;
  onClose: () => void;
  communityId: string;
}) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();

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
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
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
        className="panel relative z-10 w-full max-w-md overflow-hidden rounded-2xl shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2 id={titleId} className="brand text-2xl">
              New channel
            </h2>
            <p className="muted mt-1 text-sm">
              Name a public or private channel for this community.
            </p>
          </div>
          <button
            type="button"
            className="btn secondary shrink-0 !px-3 !py-1.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form
          className="stack space-y-4 px-5 py-4"
          action={createChannelAction.bind(null, communityId)}
        >
          <div>
            <label className="label" htmlFor="sidebar-channel-name">
              Channel name
            </label>
            <input
              ref={nameRef}
              className="field"
              id="sidebar-channel-name"
              name="name"
              required
              placeholder="ops"
            />
          </div>
          <div>
            <label className="label" htmlFor="sidebar-channel-type">
              Type
            </label>
            <select
              className="field"
              id="sidebar-channel-type"
              name="type"
              defaultValue="public"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit">
              Create channel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { memberProfilePath } from "@/lib/profile-paths";
import {
  getPresencePreference,
  subscribePresencePreference,
  type ManualPresenceStatus,
} from "@/lib/presence-preference";
import { createClient } from "@/lib/supabase/client";

export type PresenceStatus = "online" | "busy" | "offline";

export type SidebarMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

const STATUS_RANK: Record<PresenceStatus, number> = {
  online: 0,
  busy: 1,
  offline: 2,
};

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  busy: "Busy",
  offline: "Offline",
};

function normalizeStatus(status: unknown): PresenceStatus | null {
  if (status === "online" || status === "busy") return status;
  // Legacy auto-away from older clients — not a manual busy choice
  if (status === "away") return "online";
  return null;
}

type PresenceMeta = {
  user_id?: string;
  status?: string;
  online_at?: string;
};

/** Prefer the newest tracked payload when a user has multiple tabs/sessions. */
function resolveStatus(metas: PresenceMeta[]): PresenceStatus {
  let best: PresenceMeta | null = null;
  let bestAt = -1;
  for (const meta of metas) {
    const at = meta.online_at ? Date.parse(meta.online_at) : 0;
    if (!best || at >= bestAt) {
      best = meta;
      bestAt = at;
    }
  }
  return normalizeStatus(best?.status) ?? "online";
}

export function MembersList({
  communityId,
  communitySlug,
  members: initialMembers,
  currentUserId,
}: {
  communityId: string;
  communitySlug: string;
  members: SidebarMember[];
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState(initialMembers);
  const [presence, setPresence] = useState<Record<string, PresenceStatus>>({});
  const [ownStatus, setOwnStatus] = useState<ManualPresenceStatus>("online");
  const trackRef = useRef<((status: ManualPresenceStatus) => Promise<void>) | null>(null);

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  useEffect(() => {
    setOwnStatus(getPresencePreference());
    return subscribePresencePreference(setOwnStatus);
  }, []);

  useEffect(() => {
    const refetchMembers = async () => {
      const { data } = await supabase
        .from("community_members")
        .select("user_id, profiles(id, display_name, avatar_url)")
        .eq("community_id", communityId);
      if (!data) return;
      setMembers(
        data.map((m) => {
          const profile = m.profiles as unknown as {
            id: string;
            display_name: string;
            avatar_url: string | null;
          };
          return {
            user_id: m.user_id,
            display_name: profile?.display_name || "Member",
            avatar_url: profile?.avatar_url ?? null,
          };
        }),
      );
    };

    const channel = supabase
      .channel(`members:community:${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_members",
          filter: `community_id=eq.${communityId}`,
        },
        () => {
          void refetchMembers();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, supabase]);

  useEffect(() => {
    let subscribed = false;
    const channel = supabase.channel(`presence:community:${communityId}`, {
      config: { presence: { key: currentUserId } },
    });

    const syncPresence = () => {
      const state = channel.presenceState<PresenceMeta>();
      const next: Record<string, PresenceStatus> = {};
      for (const [key, metas] of Object.entries(state)) {
        if (!metas.length) continue;
        const userId = metas.find((m) => m.user_id)?.user_id || key;
        next[userId] = resolveStatus(metas);
      }
      setPresence(next);
    };

    const trackOwn = async (status: ManualPresenceStatus) => {
      if (!subscribed) return;
      await channel.track({
        user_id: currentUserId,
        status,
        online_at: new Date().toISOString(),
      });
    };

    trackRef.current = trackOwn;

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (subStatus) => {
        if (subStatus === "SUBSCRIBED") {
          subscribed = true;
          await trackOwn(getPresencePreference());
        }
      });

    return () => {
      subscribed = false;
      trackRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [communityId, currentUserId, supabase]);

  useEffect(() => {
    void trackRef.current?.(ownStatus);
  }, [ownStatus]);

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      const sa = presence[a.user_id] || "offline";
      const sb = presence[b.user_id] || "offline";
      const rank = STATUS_RANK[sa] - STATUS_RANK[sb];
      if (rank !== 0) return rank;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [members, presence]);

  return (
    <ul className="space-y-0.5">
      {sorted.map((m) => {
        const status = presence[m.user_id] || "offline";
        return (
          <li key={m.user_id}>
            <Link
              href={memberProfilePath(communitySlug, m.user_id)}
              className="nav-hover flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium leading-snug"
              title={`${m.display_name} · ${STATUS_LABEL[status]}`}
            >
              <Avatar src={m.avatar_url} name={m.display_name} size={18} />
              <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
              <span
                className={`presence-dot presence-dot--${status}`}
                role="img"
                aria-label={STATUS_LABEL[status]}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

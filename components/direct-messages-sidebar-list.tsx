"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";
import {
  SidebarPlusButton,
  SidebarSectionHeader,
} from "@/components/sidebar-section-header";
import { createClient } from "@/lib/supabase/client";

export type SidebarDm = {
  id: string;
  name: string;
  slug: string;
  peerName: string;
  peerAvatarUrl: string | null;
  isAgent: boolean;
};

export type DmPersonOption = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type DmAgentOption = {
  id: string;
  name: string;
  avatar_url: string | null;
};

type DmPeer = {
  name: string;
  avatar_url: string | null;
  isAgent: boolean;
};

export function DirectMessagesSidebarList({
  communityId,
  communitySlug,
  currentUserId,
  dms: initialDms,
  people,
  agents,
}: {
  communityId: string;
  communitySlug: string;
  currentUserId: string;
  dms: SidebarDm[];
  people: DmPersonOption[];
  agents: DmAgentOption[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [dms, setDms] = useState(initialDms);
  const [peopleOptions, setPeopleOptions] = useState(people);
  const [agentOptions, setAgentOptions] = useState(agents);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setDms(initialDms);
  }, [initialDms]);

  useEffect(() => {
    setPeopleOptions(people);
  }, [people]);

  useEffect(() => {
    setAgentOptions(agents);
  }, [agents]);

  useEffect(() => {
    const refetchPeople = async () => {
      const { data } = await supabase
        .from("community_members")
        .select("user_id, profiles(id, display_name, avatar_url)")
        .eq("community_id", communityId);
      if (!data) return;
      setPeopleOptions(
        data.map((m) => {
          const profile = m.profiles as unknown as {
            id: string;
            display_name: string;
            avatar_url: string | null;
          };
          return {
            id: profile.id,
            display_name: profile?.display_name || "Member",
            avatar_url: profile?.avatar_url ?? null,
          };
        }),
      );
    };

    const refetchAgents = async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, name, avatar_url")
        .eq("community_id", communityId)
        .eq("status", "active")
        .order("name");
      if (data) setAgentOptions(data);
    };

    const channel = supabase
      .channel(`dm-options:community:${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_members",
          filter: `community_id=eq.${communityId}`,
        },
        () => {
          void refetchPeople();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agents",
          filter: `community_id=eq.${communityId}`,
        },
        () => {
          void refetchAgents();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, supabase]);

  useEffect(() => {
    const refetch = async () => {
      const { data: channels } = await supabase
        .from("channels")
        .select("id, name, slug, type")
        .eq("community_id", communityId)
        .eq("type", "dm")
        .order("name");

      const rows = channels || [];
      if (!rows.length) {
        setDms([]);
        return;
      }

      const ids = rows.map((ch) => ch.id);
      const [{ data: memberRows }, { data: agentRows }, { data: members }] =
        await Promise.all([
          supabase
            .from("channel_members")
            .select("channel_id, user_id")
            .in("channel_id", ids),
          supabase
            .from("agent_channels")
            .select("channel_id, agents(id, name, avatar_url)")
            .in("channel_id", ids),
          supabase
            .from("community_members")
            .select("user_id, profiles(id, display_name, avatar_url)")
            .eq("community_id", communityId),
        ]);

      const profileById = new Map(
        (members || []).map((m) => {
          const profile = m.profiles as unknown as {
            id: string;
            display_name: string;
            avatar_url: string | null;
          };
          return [profile.id, profile] as const;
        }),
      );

      const peerByChannelId = new Map<string, DmPeer>();

      for (const row of agentRows || []) {
        const agent = row.agents as unknown as {
          id: string;
          name: string;
          avatar_url: string | null;
        } | null;
        if (!agent) continue;
        peerByChannelId.set(row.channel_id, {
          name: agent.name,
          avatar_url: agent.avatar_url,
          isAgent: true,
        });
      }

      for (const row of memberRows || []) {
        if (peerByChannelId.has(row.channel_id)) continue;
        if (row.user_id === currentUserId) continue;
        const profile = profileById.get(row.user_id);
        if (!profile) continue;
        peerByChannelId.set(row.channel_id, {
          name: profile.display_name,
          avatar_url: profile.avatar_url,
          isAgent: false,
        });
      }

      setDms(
        rows.map((ch) => {
          const peer = peerByChannelId.get(ch.id);
          return {
            id: ch.id,
            name: ch.name,
            slug: ch.slug,
            peerName: peer?.name || ch.name,
            peerAvatarUrl: peer?.avatar_url ?? null,
            isAgent: peer?.isAgent ?? false,
          };
        }),
      );
    };

    const channel = supabase
      .channel(`dms:community:${communityId}`)
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_members",
        },
        () => {
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_channels",
        },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, currentUserId, supabase]);

  return (
    <div>
      <SidebarSectionHeader
        label="Direct messages"
        action={
          <SidebarPlusButton
            label="New direct message"
            onClick={() => setCreateOpen(true)}
          />
        }
      />
      <ul className="space-y-0.5">
        {dms.map((dm) => (
          <li key={dm.id}>
            <Link
              href={`/c/${communitySlug}/${dm.slug}`}
              className="nav-hover flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium leading-snug"
              style={dm.isAgent ? { color: "var(--agent)" } : undefined}
            >
              <Avatar
                src={dm.peerAvatarUrl}
                name={dm.peerName}
                size={18}
              />
              <span className="truncate">{dm.peerName}</span>
            </Link>
          </li>
        ))}
      </ul>

      <NewDmDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        communitySlug={communitySlug}
        people={peopleOptions.filter((p) => p.id !== currentUserId)}
        agents={agentOptions}
      />
    </div>
  );
}

function NewDmDialog({
  open,
  onClose,
  communitySlug,
  people,
  agents,
}: {
  open: boolean;
  onClose: () => void;
  communitySlug: string;
  people: DmPersonOption[];
  agents: DmAgentOption[];
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
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
  }, [open, onClose]);

  const options = useMemo(() => {
    const personOpts = people.map((p) => ({
      key: `user:${p.id}`,
      href: `/c/${communitySlug}/dm/${p.id}`,
      name: p.display_name,
      avatar_url: p.avatar_url,
      hint: "Member",
      isAgent: false,
    }));
    const agentOpts = agents.map((a) => ({
      key: `agent:${a.id}`,
      href: `/c/${communitySlug}/dm/agent/${a.id}`,
      name: a.name,
      avatar_url: a.avatar_url,
      hint: "Agent",
      isAgent: true,
    }));
    return [...personOpts, ...agentOpts].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [agents, communitySlug, people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

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
        className="panel relative z-10 flex max-h-[min(34rem,90vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-xl"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2 id={titleId} className="brand text-2xl">
              New direct message
            </h2>
            <p className="muted mt-1 text-sm">
              Start a conversation with a member or agent.
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

        {options.length === 0 ? (
          <p className="muted px-5 py-6 text-sm">
            No one else is in this community yet.
          </p>
        ) : (
          <>
            <div className="px-5 pt-4">
              <input
                className="field"
                type="search"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
              {filtered.length === 0 ? (
                <li className="muted px-2 py-4 text-center text-sm">
                  No matches
                </li>
              ) : (
                filtered.map((option) => (
                  <li key={option.key}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left"
                      style={
                        option.isAgent ? { color: "var(--agent)" } : undefined
                      }
                      disabled={pending}
                      onClick={() => {
                        start(() => {
                          onClose();
                          router.push(option.href);
                        });
                      }}
                    >
                      <Avatar
                        src={option.avatar_url}
                        name={option.name}
                        size={32}
                        title={null}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {option.isAgent ? `@${option.name}` : option.name}
                        </span>
                        <span className="muted text-xs">{option.hint}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

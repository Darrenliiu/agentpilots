"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { agentProfilePath } from "@/lib/profile-paths";
import { createClient } from "@/lib/supabase/client";

export type SidebarAgent = {
  id: string;
  name: string;
  avatar_url: string | null;
  status?: string;
};

export function AgentsSidebarList({
  communityId,
  communitySlug,
  agents: initialAgents,
}: {
  communityId: string;
  communitySlug: string;
  agents: SidebarAgent[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState(initialAgents);

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  useEffect(() => {
    const refetch = async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, name, status, avatar_url")
        .eq("community_id", communityId)
        .eq("status", "active")
        .order("name");
      if (data) setAgents(data);
    };

    const channel = supabase
      .channel(`agents:community:${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agents",
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
    <ul className="space-y-0.5">
      {agents.map((a) => (
        <li key={a.id}>
          <Link
            href={agentProfilePath(communitySlug, a.id)}
            className="nav-hover flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium leading-snug"
            style={{ color: "var(--agent)" }}
          >
            <Avatar src={a.avatar_url} name={a.name} size={18} />
            <span className="truncate">@{a.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

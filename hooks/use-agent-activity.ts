"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentRun, AgentRunPhase } from "@/lib/types";

export type ActiveAgentRun = AgentRun & {
  agent: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
};

type RunRow = {
  id: string;
  message_id: string;
  agent_id: string;
  channel_id: string | null;
  community_id: string | null;
  status: AgentRun["status"];
  phase: AgentRunPhase | null;
  status_text: string | null;
  error: string | null;
  result_message_id: string | null;
  created_at: string;
  updated_at: string;
  agents?:
    | {
        id: string;
        name: string;
        avatar_url: string | null;
      }
    | {
        id: string;
        name: string;
        avatar_url: string | null;
      }[]
    | null;
};

function normalizeRun(row: RunRow): ActiveAgentRun {
  const agentRaw = row.agents;
  const agent = Array.isArray(agentRaw) ? agentRaw[0] || null : agentRaw || null;
  return {
    id: row.id,
    message_id: row.message_id,
    agent_id: row.agent_id,
    channel_id: row.channel_id,
    community_id: row.community_id,
    status: row.status,
    phase: row.phase,
    status_text: row.status_text,
    error: row.error,
    result_message_id: row.result_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          avatar_url: agent.avatar_url,
        }
      : null,
  };
}

function isActiveStatus(status: string) {
  return status === "running" || status === "pending";
}

async function fetchAgentMeta(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
) {
  const { data } = await supabase
    .from("agents")
    .select("id, name, avatar_url")
    .eq("id", agentId)
    .maybeSingle();
  return data;
}

export function useAgentActivity(opts: {
  communityId: string;
  channelId?: string | null;
}) {
  const { communityId, channelId = null } = opts;
  const supabase = useMemo(() => createClient(), []);
  const [runs, setRuns] = useState<ActiveAgentRun[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const runsRef = useRef(runs);
  runsRef.current = runs;

  useEffect(() => {
    if (!runs.some((r) => isActiveStatus(r.status))) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runs]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let query = supabase
        .from("agent_runs")
        .select(
          "id, message_id, agent_id, channel_id, community_id, status, phase, status_text, error, result_message_id, created_at, updated_at, agents(id, name, avatar_url)",
        )
        .eq("community_id", communityId)
        .eq("status", "running")
        .order("created_at", { ascending: true });

      if (channelId) {
        query = query.eq("channel_id", channelId);
      }

      const { data } = await query;
      if (cancelled || !data) return;
      setRuns((data as RunRow[]).map(normalizeRun));
    };

    void hydrate();

    const filter = channelId
      ? `channel_id=eq.${channelId}`
      : `community_id=eq.${communityId}`;

    const channel = supabase
      .channel(`agent-activity:${communityId}:${channelId || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_runs",
          filter,
        },
        (payload) => {
          void (async () => {
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as { id?: string };
              if (!oldRow.id) return;
              setRuns((prev) => prev.filter((r) => r.id !== oldRow.id));
              return;
            }

            const row = payload.new as RunRow;
            if (!isActiveStatus(row.status)) {
              setRuns((prev) => prev.filter((r) => r.id !== row.id));
              return;
            }

            if (channelId && row.channel_id && row.channel_id !== channelId) {
              return;
            }
            if (!channelId && row.community_id && row.community_id !== communityId) {
              return;
            }

            const existingAgent =
              runsRef.current.find((r) => r.id === row.id)?.agent ?? null;
            const agent =
              existingAgent || (await fetchAgentMeta(supabase, row.agent_id));

            const next = normalizeRun({ ...row, agents: agent });
            setRuns((prev) => {
              const without = prev.filter((r) => r.id !== next.id);
              return [...without, next].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              );
            });
          })();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [channelId, communityId, supabase]);

  const channelRuns = useMemo(() => {
    if (!channelId) return runs;
    return runs.filter((r) => r.channel_id === channelId);
  }, [channelId, runs]);

  const byChannel = useMemo(() => {
    const map = new Map<string, ActiveAgentRun[]>();
    for (const run of runs) {
      if (!run.channel_id) continue;
      const list = map.get(run.channel_id) || [];
      list.push(run);
      map.set(run.channel_id, list);
    }
    return map;
  }, [runs]);

  return {
    runs: channelId ? channelRuns : runs,
    byChannel,
    now,
  };
}

export function elapsedSeconds(createdAt: string, now: number) {
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function runStatusLabel(run: ActiveAgentRun) {
  return run.status_text?.trim() || "Working";
}

export function summarizeChannelActivity(runs: ActiveAgentRun[]) {
  if (!runs.length) return null;
  const primary = runs[0];
  const name = primary.agent?.name || "Agent";
  if (runs.length === 1) {
    return {
      summary: `${name}: ${runStatusLabel(primary)}`,
      primary,
      extraCount: 0,
    };
  }
  return {
    summary: `${name} +${runs.length - 1}`,
    primary,
    extraCount: runs.length - 1,
  };
}

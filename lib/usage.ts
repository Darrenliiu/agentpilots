import type { Agent, AgentRunStatus } from "@/lib/types";

export type UsageRangeDays = 7 | 30 | 90;

export type UsageRunRow = {
  agent_id: string;
  status: AgentRunStatus;
  created_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
};

export type UsageAgentInfo = Pick<
  Agent,
  "id" | "name" | "avatar_url" | "provider" | "model" | "status" | "kind"
>;

export type DailyBucket = {
  date: string; // YYYY-MM-DD
  tokens: number;
  runs: number;
  succeeded: number;
  failed: number;
};

export type AgentUsageRollup = {
  agent: UsageAgentInfo;
  connectionLabel: string;
  runs: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Null when pricing is unknown for this provider/model. */
  estimatedCostUsd: number | null;
};

export type UsageSummary = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  succeeded: number;
  failed: number;
  runs: number;
};

/** USD per 1M tokens. */
type ModelRates = { input: number; output: number };

const PROVIDER_FALLBACK_RATES: Record<string, ModelRates> = {
  openai: { input: 0.15, output: 0.6 },
  anthropic: { input: 3, output: 15 },
  google: { input: 0.1, output: 0.4 },
  xai: { input: 0.2, output: 0.5 },
  openrouter: { input: 0.5, output: 1.5 },
};

/** Approximate list prices (USD / 1M tokens). Kept intentionally coarse. */
const MODEL_RATES: Array<{ match: RegExp; rates: ModelRates }> = [
  { match: /^gpt-4o-mini/i, rates: { input: 0.15, output: 0.6 } },
  { match: /^gpt-4o/i, rates: { input: 2.5, output: 10 } },
  { match: /^gpt-4\.1-mini/i, rates: { input: 0.4, output: 1.6 } },
  { match: /^gpt-4\.1-nano/i, rates: { input: 0.1, output: 0.4 } },
  { match: /^gpt-4\.1/i, rates: { input: 2, output: 8 } },
  { match: /^o3-mini/i, rates: { input: 1.1, output: 4.4 } },
  { match: /^o4-mini/i, rates: { input: 1.1, output: 4.4 } },
  { match: /^o1/i, rates: { input: 15, output: 60 } },
  { match: /^claude-3-5-haiku|^claude-haiku-4/i, rates: { input: 0.8, output: 4 } },
  { match: /^claude-3-5-sonnet|^claude-sonnet-4|^claude-3-7-sonnet/i, rates: { input: 3, output: 15 } },
  { match: /^claude-opus|^claude-3-opus/i, rates: { input: 15, output: 75 } },
  { match: /^gemini-2\.0-flash|^gemini-2\.5-flash|^gemini-flash/i, rates: { input: 0.1, output: 0.4 } },
  { match: /^gemini-2\.5-pro|^gemini-pro/i, rates: { input: 1.25, output: 10 } },
  { match: /^grok-3-mini|^grok-2-mini/i, rates: { input: 0.3, output: 0.5 } },
  { match: /^grok/i, rates: { input: 3, output: 15 } },
];

export function connectionLabel(provider: string): string {
  switch (provider) {
    case "local":
      return "Local";
    case "openai":
      return "API · OpenAI";
    case "anthropic":
      return "API · Anthropic";
    case "google":
      return "API · Google";
    case "xai":
      return "API · xAI";
    case "openrouter":
      return "API · OpenRouter";
    case "openai-compatible":
      return "API · Custom";
    case "higgsfield":
      return "API · Higgsfield";
    case "midjourney":
      return "API · Midjourney";
    default:
      return provider ? `API · ${provider}` : "API";
  }
}

function ratesFor(provider: string, model: string): ModelRates | null {
  if (provider === "local") return { input: 0, output: 0 };
  for (const entry of MODEL_RATES) {
    if (entry.match.test(model)) return entry.rates;
  }
  return PROVIDER_FALLBACK_RATES[provider] ?? null;
}

export function estimateCostUsd(opts: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  const rates = ratesFor(opts.provider, opts.model);
  if (!rates) return null;
  return (
    (opts.inputTokens / 1_000_000) * rates.input +
    (opts.outputTokens / 1_000_000) * rates.output
  );
}

export function parseUsageRange(raw: string | null | undefined): UsageRangeDays {
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  return 30;
}

export function rangeStartIso(days: UsageRangeDays, now = new Date()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function eachDayKeys(days: UsageRangeDays, now = new Date()): string[] {
  const keys: string[] = [];
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function tokenTotal(run: UsageRunRow): number {
  if (typeof run.total_tokens === "number") return run.total_tokens;
  const input = typeof run.input_tokens === "number" ? run.input_tokens : 0;
  const output = typeof run.output_tokens === "number" ? run.output_tokens : 0;
  return input + output;
}

export function buildDailySeries(
  runs: UsageRunRow[],
  days: UsageRangeDays,
  now = new Date(),
): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const key of eachDayKeys(days, now)) {
    map.set(key, {
      date: key,
      tokens: 0,
      runs: 0,
      succeeded: 0,
      failed: 0,
    });
  }
  for (const run of runs) {
    const key = dayKey(run.created_at);
    const bucket = map.get(key);
    if (!bucket) continue;
    bucket.runs += 1;
    bucket.tokens += tokenTotal(run);
    if (run.status === "succeeded") bucket.succeeded += 1;
    if (run.status === "failed") bucket.failed += 1;
  }
  return [...map.values()];
}

export function buildAgentRollups(
  agents: UsageAgentInfo[],
  runs: UsageRunRow[],
): AgentUsageRollup[] {
  const byAgent = new Map<
    string,
    {
      runs: number;
      succeeded: number;
      failed: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  >();

  for (const agent of agents) {
    byAgent.set(agent.id, {
      runs: 0,
      succeeded: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  }

  for (const run of runs) {
    let agg = byAgent.get(run.agent_id);
    if (!agg) {
      agg = {
        runs: 0,
        succeeded: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      byAgent.set(run.agent_id, agg);
    }
    agg.runs += 1;
    if (run.status === "succeeded") agg.succeeded += 1;
    if (run.status === "failed") agg.failed += 1;
    agg.inputTokens += typeof run.input_tokens === "number" ? run.input_tokens : 0;
    agg.outputTokens +=
      typeof run.output_tokens === "number" ? run.output_tokens : 0;
    agg.totalTokens += tokenTotal(run);
  }

  const agentsById = new Map(agents.map((a) => [a.id, a]));
  const rollups: AgentUsageRollup[] = [];

  for (const [agentId, agg] of byAgent) {
    const agent = agentsById.get(agentId);
    if (!agent) continue;
    rollups.push({
      agent,
      connectionLabel: connectionLabel(agent.provider),
      runs: agg.runs,
      succeeded: agg.succeeded,
      failed: agg.failed,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      totalTokens: agg.totalTokens,
      estimatedCostUsd: estimateCostUsd({
        provider: agent.provider,
        model: agent.model,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
      }),
    });
  }

  return rollups.sort(
    (a, b) =>
      b.totalTokens - a.totalTokens ||
      b.runs - a.runs ||
      a.agent.name.localeCompare(b.agent.name),
  );
}

export function buildUsageSummary(
  agents: UsageAgentInfo[],
  runs: UsageRunRow[],
): UsageSummary {
  const rollups = buildAgentRollups(agents, runs);
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let succeeded = 0;
  let failed = 0;
  let estimatedCostUsd: number | null = 0;
  let hasAnyCost = false;

  for (const r of rollups) {
    totalTokens += r.totalTokens;
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    succeeded += r.succeeded;
    failed += r.failed;
    if (r.estimatedCostUsd != null) {
      hasAnyCost = true;
      estimatedCostUsd = (estimatedCostUsd ?? 0) + r.estimatedCostUsd;
    }
  }

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    estimatedCostUsd: hasAnyCost ? estimatedCostUsd : null,
    succeeded,
    failed,
    runs: runs.length,
  };
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function formatCostUsd(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

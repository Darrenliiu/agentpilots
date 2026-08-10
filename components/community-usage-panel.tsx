"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import {
  buildAgentRollups,
  buildDailySeries,
  buildUsageSummary,
  formatCostUsd,
  formatTokenCount,
  type DailyBucket,
  type UsageAgentInfo,
  type UsageRangeDays,
  type UsageRunRow,
} from "@/lib/usage";

const RANGES: { days: UsageRangeDays; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

function filterRuns(runs: UsageRunRow[], days: UsageRangeDays): UsageRunRow[] {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startMs = start.getTime();
  return runs.filter((r) => new Date(r.created_at).getTime() >= startMs);
}

function formatDayLabel(date: string, days: UsageRangeDays): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (days <= 7) {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function LineChart({
  series,
  valueKey,
  color,
  label,
  formatValue,
  days,
}: {
  series: DailyBucket[];
  valueKey: "tokens" | "runs";
  color: string;
  label: string;
  formatValue: (n: number) => string;
  days: UsageRangeDays;
}) {
  const width = 640;
  const height = 180;
  const padX = 12;
  const padTop = 16;
  const padBottom = 28;
  const values = series.map((s) => s[valueKey]);
  const max = Math.max(1, ...values);
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  const points = series.map((s, i) => {
    const x =
      series.length === 1
        ? padX + innerW / 2
        : padX + (i / (series.length - 1)) * innerW;
    const y = padTop + innerH - (s[valueKey] / max) * innerH;
    return { x, y, ...s };
  });

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const area =
    points.length > 0
      ? `${line} L ${points[points.length - 1]!.x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${points[0]!.x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`
      : "";

  const labelStep = days <= 7 ? 1 : days <= 30 ? 5 : 10;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="usage-chart panel rounded-2xl p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{label}</h2>
        <p className="muted text-xs tabular-nums">{formatValue(total)} total</p>
      </div>
      {total === 0 ? (
        <p className="muted flex h-[180px] items-center justify-center text-sm">
          No activity in this range
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="usage-chart__svg h-auto w-full"
          role="img"
          aria-label={label}
        >
          {[0.25, 0.5, 0.75, 1].map((t) => {
            const y = padTop + innerH - t * innerH;
            return (
              <line
                key={t}
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
            );
          })}
          <path d={area} fill={color} opacity="0.14" />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) =>
            i % labelStep === 0 || i === points.length - 1 ? (
              <text
                key={p.date}
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                className="usage-chart__tick"
              >
                {formatDayLabel(p.date, days)}
              </text>
            ) : null,
          )}
        </svg>
      )}
    </div>
  );
}

function BarShare({
  rollups,
}: {
  rollups: ReturnType<typeof buildAgentRollups>;
}) {
  const top = rollups.filter((r) => r.totalTokens > 0).slice(0, 6);
  const total = top.reduce((s, r) => s + r.totalTokens, 0);
  if (total === 0) {
    return (
      <div className="usage-chart panel rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold">Share by agent</h2>
        <p className="muted flex h-[120px] items-center justify-center text-sm">
          No token usage yet
        </p>
      </div>
    );
  }

  const palette = [
    "var(--accent)",
    "var(--accent-2)",
    "color-mix(in srgb, var(--accent) 65%, var(--ink))",
    "color-mix(in srgb, var(--accent-2) 70%, var(--ink))",
    "color-mix(in srgb, var(--accent) 40%, var(--line))",
    "color-mix(in srgb, var(--ink) 35%, var(--line))",
  ];

  return (
    <div className="usage-chart panel rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-semibold">Share by agent</h2>
      <div
        className="flex h-3 overflow-hidden rounded-full"
        style={{ background: "var(--line)" }}
        role="img"
        aria-label="Token share by agent"
      >
        {top.map((r, i) => (
          <div
            key={r.agent.id}
            style={{
              width: `${(r.totalTokens / total) * 100}%`,
              background: palette[i % palette.length],
            }}
            title={`${r.agent.name}: ${formatTokenCount(r.totalTokens)}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {top.map((r, i) => (
          <li
            key={r.agent.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: palette[i % palette.length] }}
              />
              <span className="truncate">{r.agent.name}</span>
            </span>
            <span className="muted shrink-0 tabular-nums">
              {Math.round((r.totalTokens / total) * 100)}% ·{" "}
              {formatTokenCount(r.totalTokens)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CommunityUsagePanel({
  communitySlug,
  agents,
  runs,
  initialRange = 30,
}: {
  communitySlug: string;
  agents: UsageAgentInfo[];
  runs: UsageRunRow[];
  initialRange?: UsageRangeDays;
}) {
  const [range, setRange] = useState<UsageRangeDays>(initialRange);

  const filtered = useMemo(() => filterRuns(runs, range), [runs, range]);
  const series = useMemo(
    () => buildDailySeries(filtered, range),
    [filtered, range],
  );
  const rollups = useMemo(
    () => buildAgentRollups(agents, filtered),
    [agents, filtered],
  );
  const summary = useMemo(
    () => buildUsageSummary(agents, filtered),
    [agents, filtered],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">
          Token totals and cost estimates from agent runs. Estimates use public
          list prices and may differ from your provider bill.
        </p>
        <div className="pill-toggle" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              className="pill-toggle__btn"
              aria-pressed={range === r.days}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Tokens"
          value={formatTokenCount(summary.totalTokens)}
          hint={
            summary.inputTokens || summary.outputTokens
              ? `${formatTokenCount(summary.inputTokens)} in · ${formatTokenCount(summary.outputTokens)} out`
              : undefined
          }
        />
        <SummaryCard
          label="Est. cost"
          value={formatCostUsd(summary.estimatedCostUsd)}
          hint="Approximate"
        />
        <SummaryCard
          label="Successful runs"
          value={summary.succeeded.toLocaleString()}
        />
        <SummaryCard
          label="Failed runs"
          value={summary.failed.toLocaleString()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LineChart
            series={series}
            valueKey="tokens"
            color="var(--accent)"
            label="Token usage"
            formatValue={formatTokenCount}
            days={range}
          />
        </div>
        <div className="lg:col-span-2">
          <BarShare rollups={rollups} />
        </div>
      </div>

      <LineChart
        series={series}
        valueKey="runs"
        color="var(--accent-2)"
        label="Agent run activity"
        formatValue={(n) => n.toLocaleString()}
        days={range}
      />

      <section className="panel overflow-hidden rounded-2xl">
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
          <h2 className="text-sm font-semibold">Agents</h2>
        </div>
        {rollups.length === 0 ? (
          <p className="muted px-5 py-8 text-sm">
            No agents yet.{" "}
            <Link
              className="underline"
              href={`/c/${communitySlug}/settings/agents/new`}
            >
              Create an agent
            </Link>{" "}
            to start tracking usage.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="usage-table w-full text-left text-sm">
              <thead>
                <tr className="muted text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 font-semibold">Agent</th>
                  <th className="px-3 py-3 font-semibold">Connection</th>
                  <th className="px-3 py-3 font-semibold">Model</th>
                  <th className="px-3 py-3 font-semibold tabular-nums">Runs</th>
                  <th className="px-3 py-3 font-semibold tabular-nums">
                    Tokens
                  </th>
                  <th className="px-3 py-3 font-semibold tabular-nums">
                    Est. cost
                  </th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((row) => (
                  <tr
                    key={row.agent.id}
                    className="border-t"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/c/${communitySlug}/settings/agents/${row.agent.id}`}
                        className="flex items-center gap-2.5 font-medium hover:underline"
                      >
                        <Avatar
                          name={row.agent.name}
                          src={row.agent.avatar_url}
                          size={28}
                        />
                        <span className="truncate">{row.agent.name}</span>
                      </Link>
                    </td>
                    <td className="muted px-3 py-3 whitespace-nowrap">
                      {row.connectionLabel}
                    </td>
                    <td className="muted max-w-[10rem] truncate px-3 py-3">
                      {row.agent.model}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.runs.toLocaleString()}
                      {row.failed > 0 ? (
                        <span className="muted ml-1 text-xs">
                          ({row.failed} failed)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.totalTokens > 0 ? (
                        <span title={`${row.inputTokens.toLocaleString()} in · ${row.outputTokens.toLocaleString()} out`}>
                          {formatTokenCount(row.totalTokens)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatCostUsd(row.estimatedCostUsd)}
                    </td>
                    <td className="px-5 py-3 capitalize">
                      <span
                        className={
                          row.agent.status === "active"
                            ? "text-[color:var(--accent)]"
                            : "muted"
                        }
                      >
                        {row.agent.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="panel rounded-2xl p-4">
      <p className="muted text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? <p className="muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

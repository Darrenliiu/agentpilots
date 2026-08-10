import type { CSSProperties } from "react";

/** Prefer colored PNG marks when present; fall back to SVG. */
const ICON_FILES: Record<string, string> = {
  notion: "/connectors/notion.png",
  linear: "/connectors/linear.svg",
  github: "/connectors/github.svg",
  figma: "/connectors/figma.svg",
  context7: "/connectors/context7.png",
  vercel: "/connectors/vercel.png",
  supabase: "/connectors/supabase.png",
  googledrive: "/connectors/googledrive.svg",
  "google-drive": "/connectors/googledrive.svg",
  gmail: "/connectors/gmail.svg",
  googlecalendar: "/connectors/googlecalendar.svg",
  "google-calendar": "/connectors/googlecalendar.svg",
  googlechat: "/connectors/googlechat.svg",
  "google-chat": "/connectors/googlechat.svg",
  slack: "/connectors/slack.png",
  stripe: "/connectors/stripe.svg",
  sentry: "/connectors/sentry.png",
  atlassian: "/connectors/atlassian.png",
  hubspot: "/connectors/hubspot.png",
  neon: "/connectors/neon.svg",
  cloudflare: "/connectors/cloudflare.svg",
  monday: "/connectors/monday.png",
  asana: "/connectors/asana.png",
  box: "/connectors/box.png",
  paypal: "/connectors/paypal.png",
  amplitude: "/connectors/amplitude.png",
  exa: "/connectors/exa.svg",
  ahrefs: "/connectors/ahrefs.png",
  semrush: "/connectors/semrush.svg",
  x: "/connectors/x.svg",
  "x-docs": "/connectors/x.svg",
};

function resolveIconSrc(icon?: string | null, name?: string): string | null {
  if (icon) {
    if (icon.startsWith("/") || icon.startsWith("http")) return icon;
    const byKey = ICON_FILES[icon.toLowerCase()];
    if (byKey) return byKey;
  }
  if (name) {
    const normalized = name.toLowerCase().replace(/[\s.]+/g, "");
    const byName = ICON_FILES[normalized];
    if (byName) return byName;
    // monday.com → monday
    const stripped = normalized.replace(/\.com$/, "");
    if (ICON_FILES[stripped]) return ICON_FILES[stripped];
  }
  return null;
}

function GenericMark({ name }: { name: string }) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span
      className="flex h-full w-full items-center justify-center text-xs font-semibold"
      style={{ color: "var(--ink-muted)" }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function ConnectorIcon({
  icon,
  name,
  size = 40,
  className,
}: {
  icon?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = resolveIconSrc(icon, name);
  const shellStyle: CSSProperties = {
    width: size,
    height: size,
    borderColor: "var(--line)",
    background: "var(--panel)",
  };

  const fillShell =
    !!src &&
    (src.endsWith(".png") ||
      src.includes("context7") ||
      src.includes("monday") ||
      src.includes("exa"));

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border ${className || ""}`}
      style={shellStyle}
      title={name}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={fillShell ? size : Math.round(size * 0.62)}
          height={fillShell ? size : Math.round(size * 0.62)}
          className="object-contain"
          style={fillShell ? { width: "100%", height: "100%" } : undefined}
        />
      ) : (
        <GenericMark name={name} />
      )}
    </span>
  );
}

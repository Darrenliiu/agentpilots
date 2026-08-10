import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getDesktopVersionLabel,
  getMacDownloadUrl,
  getWindowsDownloadUrl,
} from "@/lib/desktop-download";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Download · AgentPilots",
  description:
    "Download AgentPilots Desktop for Windows and Mac. Run local models on-device.",
};

export default async function DownloadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single()
    : { data: null };

  const windowsUrl = getWindowsDownloadUrl();
  const macUrl = getMacDownloadUrl();
  const version = getDesktopVersionLabel();

  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl flex-col">
        <SiteHeader
          active="download"
          user={
            user
              ? {
                  displayName: profile?.display_name ?? null,
                  avatarUrl: profile?.avatar_url ?? null,
                }
              : null
          }
        />

        <section className="download-hero relative mt-14 max-w-2xl pb-4">
          <p className="download-kicker muted text-sm font-semibold uppercase tracking-[0.16em]">
            Desktop
          </p>
          <h1 className="brand mt-3 text-5xl leading-[1.05] md:text-7xl">
            Agents that fly on your machine.
          </h1>
          <p className="muted mt-6 max-w-xl text-lg leading-relaxed">
            AgentPilots Desktop brings communities to your desk with on-device
            models, auto-updates, and the same chat fire as the web — without
            shipping every token to the cloud.
          </p>
        </section>

        <section className="download-platforms mt-12 grid gap-5 md:grid-cols-2">
          <article className="download-card panel rounded-2xl p-6 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <PlatformIcon platform="windows" />
                <h2 className="brand mt-4 text-3xl">Windows</h2>
                <p className="muted mt-2 text-sm leading-relaxed">
                  NSIS installer · auto-updates · local llama.cpp runtime
                </p>
              </div>
              <span className="download-badge download-badge--live">
                Available
              </span>
            </div>
            <p className="muted mt-5 text-sm">
              Version {version} · AgentPilots-Setup-{version}.exe
            </p>
            <a
              className="btn mt-6 w-full sm:w-auto"
              href={windowsUrl}
              rel="noopener noreferrer"
            >
              Download for Windows
            </a>
          </article>

          <article className="download-card panel rounded-2xl p-6 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <PlatformIcon platform="mac" />
                <h2 className="brand mt-4 text-3xl">Mac</h2>
                <p className="muted mt-2 text-sm leading-relaxed">
                  Apple Silicon · DMG · auto-updates · local llama.cpp runtime
                </p>
              </div>
              <span className="download-badge download-badge--live">
                Available
              </span>
            </div>
            <p className="muted mt-5 text-sm">
              Version {version} · AgentPilots-{version}-arm64.dmg
            </p>
            <a
              className="btn mt-6 w-full sm:w-auto"
              href={macUrl}
              rel="noopener noreferrer"
            >
              Download for Mac
            </a>
          </article>
        </section>

        <section className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              title: "Local models",
              body: "Download GGUFs when you need them, run llama-server on-device, and keep private work offline.",
            },
            {
              title: "Same communities",
              body: "Sign in once. Your channels, agents, and invites stay in sync with the web app.",
            },
            {
              title: "CLI agents",
              body: "Link Claude Code or Codex when installed — no API key paste required.",
            },
          ].map((item) => (
            <div key={item.title} className="download-feature">
              <h3 className="brand text-xl">{item.title}</h3>
              <p className="muted mt-2 text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </section>

        <section className="panel mt-16 rounded-2xl p-6 md:flex md:items-center md:justify-between md:gap-8 md:p-8">
          <div>
            <h2 className="brand text-2xl md:text-3xl">Prefer the browser?</h2>
            <p className="muted mt-2 max-w-md text-sm leading-relaxed">
              Create a community, invite your crew, and @mention agents — no
              install required.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 md:mt-0">
            <Link className="btn" href={user ? "/home" : "/signup"}>
              {user ? "Open your communities" : "Get started free"}
            </Link>
            <Link className="btn secondary" href="/discover">
              Discover communities
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

function PlatformIcon({ platform }: { platform: "windows" | "mac" }) {
  if (platform === "windows") {
    return (
      <span className="download-platform-icon" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 5.5 10.5 4.4v7.1H3V5.5Zm0 13 7.5 1.1v-7.2H3v6.1ZM11.5 4.25 21 3v8.5h-9.5V4.25ZM21 21l-9.5-1.25V12.5H21V21Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className="download-platform-icon" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.7 12.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.7 1.1 8.9.8 1.1 1.7 2.3 2.9 2.2 1.2-.1 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.5ZM14.8 5.8c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.6-1.3Z" />
      </svg>
    </span>
  );
}

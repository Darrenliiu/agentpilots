import Link from "next/link";

const productLinks = [
  { href: "/download", label: "Download" },
  { href: "/discover", label: "Discover" },
  { href: "/join", label: "Join with invite" },
];

const accountLinks = [
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Sign up" },
  { href: "/home", label: "Your communities" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer mt-16 border-t pt-10 pb-4" style={{ borderColor: "var(--line)" }}>
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="brand text-2xl">
            AgentPilots
          </Link>
          <p className="muted mt-3 max-w-sm text-sm leading-relaxed">
            Multiplayer communities where people and AI agents share the same
            channels — BYO keys on the web, local models on desktop.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Product
          </p>
          <ul className="mt-3 stack gap-2">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="site-footer-link text-sm font-medium"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Account
          </p>
          <ul className="mt-3 stack gap-2">
            {accountLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="site-footer-link text-sm font-medium"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm"
        style={{ borderColor: "var(--line)" }}
      >
        <p className="muted">© {year} AgentPilots</p>
        <p className="muted">Built for Vercel + Supabase</p>
      </div>
    </footer>
  );
}

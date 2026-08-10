import Link from "next/link";
import { Avatar } from "@/components/avatar";

type SiteHeaderProps = {
  user?: {
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  active?: "home" | "discover" | "download";
};

export function SiteHeader({ user, active }: SiteHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link href="/" className="brand text-3xl md:text-4xl">
        AgentPilots
      </Link>
      <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Link
          className={navClass(active === "discover")}
          href="/discover"
        >
          Discover
        </Link>
        <Link
          className={navClass(active === "download")}
          href="/download"
        >
          Download
        </Link>
        {user ? (
          <Link
            href="/home"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5"
          >
            <Avatar src={user.avatarUrl} name={user.displayName} size={28} />
            <span className="max-w-[10rem] truncate text-sm font-semibold">
              {user.displayName || "You"}
            </span>
          </Link>
        ) : (
          <>
            <Link className="btn secondary" href="/login">
              Log in
            </Link>
            <Link className="btn" href="/signup">
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function navClass(isActive: boolean) {
  return [
    "btn secondary",
    isActive ? "site-nav-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  segment: string;
  label: string;
  icon: ReactNode;
};

const PERSONAL: NavItem[] = [
  {
    segment: "profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 19.25c1.6-3.1 4-4.75 6.5-4.75s4.9 1.65 6.5 4.75" strokeLinecap="round" />
      </svg>
    ),
  },
];

const COMMUNITY: NavItem[] = [
  {
    segment: "",
    label: "General",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path
          d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.4 6.4l1.6 1.6M16 16l1.6 1.6M17.6 6.4 16 8M8 16l-1.6 1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    segment: "members",
    label: "Members",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="9" cy="8.5" r="2.75" />
        <circle cx="16.25" cy="9.25" r="2.25" />
        <path
          d="M3.75 18.25c.9-2.6 2.7-3.9 5.25-3.9s4.35 1.3 5.25 3.9"
          strokeLinecap="round"
        />
        <path
          d="M13.5 18.25c.55-1.7 1.55-2.55 3-2.55 1.55 0 2.55.95 3.1 2.55"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    segment: "invites",
    label: "Invites",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4 7.5 8 5.5 8-5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    segment: "billing",
    label: "Billing",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="2" />
        <path d="M3.5 10h17M8 14h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    segment: "channels",
    label: "Channels",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M5 7.5h14M5 12h14M5 16.5h9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    segment: "agents",
    label: "Agents",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="6.5" y="8" width="11" height="9.5" rx="2.5" />
        <path d="M12 4.5v3.5M9.5 14h5M10 18.5v1.5M14 18.5v1.5" strokeLinecap="round" />
        <circle cx="10" cy="12.25" r="0.85" fill="currentColor" stroke="none" />
        <circle cx="14" cy="12.25" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    segment: "connectors",
    label: "Connectors",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path
          d="M9.5 14.5 8 16a3.2 3.2 0 0 1-4.5-4.5l2-2a3.2 3.2 0 0 1 4.5 0"
          strokeLinecap="round"
        />
        <path
          d="M14.5 9.5 16 8a3.2 3.2 0 0 1 4.5 4.5l-2 2a3.2 3.2 0 0 1-4.5 0"
          strokeLinecap="round"
        />
        <path d="m10 14 4-4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    segment: "skills",
    label: "Skills",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path
          d="M8 5.5h8l.8 3.2H7.2L8 5.5ZM7.5 8.7 6 18.5h12L16.5 8.7"
          strokeLinejoin="round"
        />
        <path d="M10 12.5h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    segment: "models",
    label: "Local models",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="11" rx="2" />
        <path d="M8 19.5h8M12 16.5v3" strokeLinecap="round" />
      </svg>
    ),
  },
];

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`settings-nav-link${active ? " settings-nav-link--active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="settings-nav-link__icon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-nav-section">
      <p className="settings-nav-section__title">{title}</p>
      <div className="settings-nav-section__items">{children}</div>
    </div>
  );
}

export function CommunitySettingsSidebar({
  communitySlug,
  version = "0.1.0",
}: {
  communitySlug: string;
  version?: string;
}) {
  const pathname = usePathname();
  const base = `/c/${communitySlug}/settings`;

  function isActive(segment: string) {
    if (segment === "") return pathname === base;
    const href = `${base}/${segment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="settings-sidebar panel sticky top-0 flex h-screen flex-col overflow-hidden border-r">
      <div className="settings-sidebar__top">
        <Link href={`/c/${communitySlug}`} className="settings-back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M15 6.5 9 12l6 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to app
        </Link>
      </div>

      <nav className="settings-sidebar__nav" aria-label="Settings">
        <NavSection title="Personal">
          {PERSONAL.map((item) => (
            <NavLink
              key={item.label}
              href={`${base}/${item.segment}`}
              label={item.label}
              icon={item.icon}
              active={isActive(item.segment)}
            />
          ))}
        </NavSection>

        <NavSection title="Community">
          {COMMUNITY.map((item) => (
            <NavLink
              key={item.label}
              href={item.segment ? `${base}/${item.segment}` : base}
              label={item.label}
              icon={item.icon}
              active={isActive(item.segment)}
            />
          ))}
        </NavSection>
      </nav>

      <p className="settings-sidebar__version muted">v{version}</p>
    </aside>
  );
}

/** Mobile / narrow: horizontal link strip used above settings content. */
export function CommunitySettingsMobileNav({
  communitySlug,
}: {
  communitySlug: string;
}) {
  const pathname = usePathname();
  const base = `/c/${communitySlug}/settings`;
  const items = [...PERSONAL, ...COMMUNITY];

  return (
    <div className="settings-mobile-nav">
      <Link href={`/c/${communitySlug}`} className="settings-back-link settings-back-link--mobile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M15 6.5 9 12l6 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to app
      </Link>
      <nav className="settings-mobile-nav__links" aria-label="Settings sections">
        {items.map((item) => {
          const href = item.segment ? `${base}/${item.segment}` : base;
          const active =
            item.segment === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.label}
              href={href}
              className={`settings-mobile-nav__chip${active ? " settings-mobile-nav__chip--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

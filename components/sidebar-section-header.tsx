"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function SidebarSectionHeader({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="muted text-[11px] font-semibold uppercase tracking-[0.08em]">
        {label}
      </span>
      {action ?? null}
    </div>
  );
}

export function SidebarPlusButton({
  label,
  onClick,
  href,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = "muted text-sm leading-none hover:text-[var(--ink)]";
  if (href) {
    return (
      <Link href={href} className={className} title={label} aria-label={label}>
        +
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      +
    </button>
  );
}

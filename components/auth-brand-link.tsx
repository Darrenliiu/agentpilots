"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isDesktopClient } from "@/lib/desktop";

/** On desktop, brand stays on auth; on web it goes to marketing `/`. */
export function AuthBrandLink({
  className,
  children = "AgentPilots",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [href, setHref] = useState("/login");

  useEffect(() => {
    setHref(isDesktopClient() ? "/login" : "/");
  }, []);

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

import Link from "next/link";

/** Brand on auth screens always returns to the marketing homepage. */
export function AuthBrandLink({
  className,
  children = "AgentPilots",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link className={className} href="/">
      {children}
    </Link>
  );
}

import Link from "next/link";
import { AuthBrandLink } from "@/components/auth-brand-link";
import { AuthForm } from "@/components/auth-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <AuthBrandLink className="brand mb-8 text-3xl" />
      <h1 className="brand text-4xl">Create account</h1>
      <p className="muted mt-2 mb-8">Start a community or accept an invite.</p>
      <AuthForm mode="signup" next={next || "/home"} />
      <p className="muted mt-6 text-sm">
        Already flying?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
          Log in
        </Link>
      </p>
    </main>
  );
}

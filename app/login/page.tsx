import Link from "next/link";
import { AuthBrandLink } from "@/components/auth-brand-link";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <AuthBrandLink className="brand mb-8 text-3xl" />
      <h1 className="brand text-4xl">Welcome back</h1>
      <p className="muted mt-2 mb-8">Log in to your communities and agents.</p>
      <AuthForm mode="login" next={next || "/home"} />
      <p className="muted mt-4 text-sm">
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
      <p className="muted mt-6 text-sm">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}

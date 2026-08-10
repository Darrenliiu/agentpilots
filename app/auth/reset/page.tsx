import { AuthBrandLink } from "@/components/auth-brand-link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function AuthResetPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <AuthBrandLink className="brand mb-8 text-3xl" />
      <h1 className="brand text-4xl">Choose a new password</h1>
      <p className="muted mt-2 mb-8">
        You&apos;re signed in via the reset link. Set a new password to continue.
      </p>
      <ResetPasswordForm />
    </main>
  );
}

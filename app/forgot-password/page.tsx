import { AuthBrandLink } from "@/components/auth-brand-link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <AuthBrandLink className="brand mb-8 text-3xl" />
      <h1 className="brand text-4xl">Reset password</h1>
      <p className="muted mt-2 mb-8">
        Enter your email and we&apos;ll send a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </main>
  );
}

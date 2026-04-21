import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-4xl font-bold text-center mb-2">Sign in</h1>
      <p className="text-white/60 text-center mb-8">Welcome back. Ready to rip?</p>
      <LoginForm mode="signin" />
    </div>
  );
}

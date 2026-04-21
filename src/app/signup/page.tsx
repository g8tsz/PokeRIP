import { LoginForm } from "@/components/login-form";

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-4xl font-bold text-center mb-2">Create an account</h1>
      <p className="text-white/60 text-center mb-8">
        18+ only. By signing up you agree to our{" "}
        <a href="/terms" className="underline">Terms</a>.
      </p>
      <LoginForm mode="signup" />
    </div>
  );
}

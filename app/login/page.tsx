"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { useToast } from "../components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated → bounce to dashboard. Runs on mount and on
  // any re-render where `user` flips to non-null (e.g. logged in via a
  // different tab). router.replace so /login isn't on the back stack.
  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(result.reason);
      setSubmitting(false);
      return;
    }
    toast.push({
      type: "success",
      title: "Welcome back",
      description: email,
    });
    router.replace("/dashboard");
  }

  // While we have a user, don't flash the form before the redirect
  // settles. Show a minimal placeholder that matches the layout height.
  if (user) {
    return (
      <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-6 py-12">
        <p className="text-sm text-gray-400">Already signed in — redirecting…</p>
      </main>
    );
  }

  return (
    <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-cyan-400/20 bg-white/5 p-8 shadow-[0_0_60px_-20px_rgba(34,211,238,0.4)] backdrop-blur">
        <h1 className="mb-2 text-center text-4xl font-bold text-cyan-400">
          Login
        </h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Bine ai revenit în arenă.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@brain-arena.gg"
              autoComplete="email"
              className="rounded-xl border border-white/10 bg-black/40 p-4 text-white outline-none transition-colors focus:border-cyan-400 focus:shadow-[0_0_20px_-6px_rgba(34,211,238,0.6)]"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="rounded-xl border border-white/10 bg-black/40 p-4 text-white outline-none transition-colors focus:border-cyan-400 focus:shadow-[0_0_20px_-6px_rgba(34,211,238,0.6)]"
              required
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 rounded-xl bg-cyan-400 p-4 font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_24px_-2px_rgba(34,211,238,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
          >
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}

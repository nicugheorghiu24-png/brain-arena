"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { useToast } from "../components/ui/Toast";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, signUp } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const result = await signUp({
      email,
      password,
      username: username.trim(),
    });
    if (!result.ok) {
      setError(result.reason);
      setSubmitting(false);
      return;
    }
    toast.push({
      type: "success",
      title: "Account created",
      description: `Welcome, ${username.trim()}.`,
    });
    router.replace("/dashboard");
  }

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
          Register
        </h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Creează-ți contul și intră în arenă.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ShadowFox"
              autoComplete="username"
              className="rounded-xl border border-white/10 bg-black/40 p-4 text-white outline-none transition-colors focus:border-cyan-400 focus:shadow-[0_0_20px_-6px_rgba(34,211,238,0.6)]"
              required
            />
          </label>

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
              autoComplete="new-password"
              className="rounded-xl border border-white/10 bg-black/40 p-4 text-white outline-none transition-colors focus:border-cyan-400 focus:shadow-[0_0_20px_-6px_rgba(34,211,238,0.6)]"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Confirm Password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
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
            {submitting ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Ai deja un cont?{" "}
          <Link
            href="/login"
            className="font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

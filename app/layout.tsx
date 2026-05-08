import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./components/AuthProvider";
import { getCurrentUserWithProfile } from "./lib/auth/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brain Arena — Skill-based multiplayer battles",
  description:
    "Skill-based 1v1 brain battles. Logic, speed, memory. No luck. Just skill.",
};

// The root layout reads the session cookie to seed AuthProvider with
// the authenticated user. That makes every route in the app
// dynamically rendered per-request, which is what we want — auth state
// MUST come from the request's cookie, not a build-time snapshot.
// Without this, /dashboard, /login, /register etc. get prerendered
// once at build time with initialUser=null and that stale HTML is
// served to authenticated users, which renders "Redirecting to login"
// on the dashboard until JS hydrates.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side cookie read. The initial paint has the correct auth
  // state (no FOUC on logged-in users), and AuthProvider's first-mount
  // refresh reconciles any drift.
  const initialUser = await getCurrentUserWithProfile();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        <AuthProvider initialUser={initialUser}>
          <ToastProvider>
            <Navbar />
            <div className="flex-1">{children}</div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

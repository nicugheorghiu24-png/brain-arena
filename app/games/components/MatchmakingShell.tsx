"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Avatar } from "../../components/ui/Avatar";
import { TierBadge } from "../../components/ui/TierBadge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../components/AuthProvider";
import { getGame } from "../registry";

type Props = {
  gameId: string;
  redirectTo?: string;
  cancelHref?: string;
};

export function MatchmakingShell({
  gameId,
  redirectTo = "/arena",
  cancelHref = "/games",
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState("Connecting...");
  const [opponent, setOpponent] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const meta = getGame(gameId);

  useEffect(() => {
    if (!user) {
      toast.push({ type: "error", title: "Not authenticated" });
      router.push("/login");
      return;
    }

    let socket: Socket | null = null;
    socket = io({ withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Joining queue...");
      socket?.emit("join_queue", { gameId });
    });

    socket.on("queued", (data) => {
      setStatus(`In queue (position: ${data.position})`);
    });

    socket.on("queue_error", (data: { reason: string }) => {
      toast.push({
        type: "error",
        title: "Matchmaking error",
        description: data.reason,
      });
      setStatus(data.reason);
    });

    socket.on("match_found", (data) => {
      setStatus("Match found!");
      setOpponent(data.opponent.username);
      router.push(`${redirectTo}?matchId=${data.matchId}&seed=${data.seed}`);
    });

    socket.on("countdown", (count) => {
      setCountdown(count);
      setStatus(`Starting in ${count}...`);
    });

    socket.on("match_start", () => {
      setStatus("Match starting!");
    });

    socket.on("disconnect", () => {
      setStatus("Disconnected");
    });

    return () => {
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [gameId, router, toast, redirectTo, user]);

  function cancel() {
    const socket = socketRef.current;
    if (socket) {
      // Try the cooperative path first: tell the server to drop us
      // from the queue. emit() is fire-and-forget; if the socket isn't
      // connected, this is a no-op locally. Then disconnect so the
      // server's `disconnect` handler also runs `removePlayer(socket.id)`
      // — defense in depth so we never leave a stale queue entry.
      try {
        socket.emit("leave_queue");
      } catch {
        // ignore — disconnect below is the real cleanup path
      }
      socket.disconnect();
      socketRef.current = null;
    }
    toast.push({ type: "info", title: "Left queue" });
    // replace, not push — the cancelled matchmaking screen shouldn't
    // sit on the back stack. Browser back from /games would otherwise
    // bounce the user back into the queue immediately.
    router.replace(cancelHref);
  }

  return (
    <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-12 text-white">
      <div className="w-full max-w-xl space-y-8">
        <div className="rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-black p-8 text-center shadow-[0_0_80px_-30px_rgba(34,211,238,0.7)] backdrop-blur sm:p-10">
          {meta && (
            <div className="mb-4 inline-flex rounded-full border border-cyan-400/40 bg-black/40 px-3 py-1 text-xs uppercase tracking-widest text-cyan-300">
              {meta.mode}
            </div>
          )}
          <div className="relative mx-auto flex h-44 w-44 items-center justify-center sm:h-56 sm:w-56">
            {/* Decorative pulse rings. They use transform: scale(2.4)
               which puts their hit-test boxes over the Cancel button
               below — pointer-events-none keeps clicks flowing through. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inline-flex h-full w-full rounded-full border-2 border-cyan-400/40 animate-pulse-ring"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inline-flex h-full w-full rounded-full border-2 border-cyan-400/30 animate-pulse-ring"
              style={{ animationDelay: "0.6s" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inline-flex h-full w-full rounded-full border-2 border-cyan-400/20 animate-pulse-ring"
              style={{ animationDelay: "1.2s" }}
            />
            <div className="relative z-10 flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-slate-900/80">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400 sm:text-3xl">
                  {countdown !== null ? countdown : "?"}
                </div>
                <div className="mt-1 text-xs text-cyan-300/80 sm:text-sm">
                  {status}
                </div>
              </div>
            </div>
          </div>
          {opponent && (
            <div className="mt-6 text-center">
              <div className="text-sm text-cyan-300/80">vs</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {opponent}
              </div>
            </div>
          )}
          <div className="mt-8 flex justify-center">
            <button
              onClick={cancel}
              className="rounded-full border border-red-400/50 bg-red-500/10 px-6 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

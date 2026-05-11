"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { ChessBoard } from "./components/ChessBoard";
import { useAuth } from "../components/AuthProvider";
import { useToast } from "../components/ui/Toast";
import type { AchievementRecord } from "../lib/games/achievements-catalog";
import type { MatchMilestones } from "../lib/matchClient";

type CurrentUser = {
  id: string;
  username: string;
  email: string;
};

type ChessClocks = {
  whiteMs: number;
  blackMs: number;
  turnStartedAt: number; // 0 = stopped (pre-game / post-game)
  incrementMs: number;
  initialMs: number;
};

const PIECE_GLYPHS: Record<string, string> = {
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const STARTING_COUNT: Record<string, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

type CapturedSummary = {
  // Pieces captured BY a player (i.e. captured opponent's pieces).
  byWhite: string[]; // lowercase types: black pieces captured by white
  byBlack: string[]; // uppercase types: white pieces captured by black
  whiteAdvantage: number; // material delta in pawns; positive favours white
};

function summarizeCaptures(fen: string): CapturedSummary {
  const placement = fen.split(" ")[0] ?? "";
  const onBoard: Record<string, number> = {};
  for (const ch of placement) {
    if (/[prnbqkPRNBQK]/.test(ch)) {
      onBoard[ch] = (onBoard[ch] ?? 0) + 1;
    }
  }

  const byWhite: string[] = []; // black pieces missing
  const byBlack: string[] = []; // white pieces missing
  let whiteMaterial = 0;
  let blackMaterial = 0;

  for (const type of ["p", "n", "b", "r", "q"] as const) {
    const start = STARTING_COUNT[type];
    const blackOnBoard = onBoard[type] ?? 0;
    const whiteOnBoard = onBoard[type.toUpperCase()] ?? 0;
    const blackCaptured = Math.max(0, start - blackOnBoard);
    const whiteCaptured = Math.max(0, start - whiteOnBoard);
    for (let i = 0; i < blackCaptured; i++) byWhite.push(type);
    for (let i = 0; i < whiteCaptured; i++) byBlack.push(type.toUpperCase());
    whiteMaterial += whiteOnBoard * PIECE_VALUES[type];
    blackMaterial += blackOnBoard * PIECE_VALUES[type];
  }

  return {
    byWhite,
    byBlack,
    whiteAdvantage: whiteMaterial - blackMaterial,
  };
}

type MatchState = {
  matchId: string;
  fen: string;
  turn: "w" | "b";
  white: { userId: string; username: string };
  black: { userId: string; username: string };
  moveHistory: string[];
  drawOffers: string[];
  result?: {
    outcome: "win" | "loss" | "draw";
    winnerId?: string;
    reason: string;
  };
  clocks?: ChessClocks;
  serverNow?: number;
};

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type ConnectionPhase =
  | "connecting"
  | "joining"
  | "live"
  | "spectating"
  | "ended"
  | "disconnected"
  | "error";

function ChessPageInner() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("matchId") ?? undefined;
  const spectate = searchParams.get("spectate") === "1";

  if (!matchId) {
    return <NoMatchSelected />;
  }
  // Re-key on matchId so rematch navigation reliably resets all local
  // state (sockets, timers, derived UI) without resetting state in
  // the effect body.
  return <ChessMatch key={matchId} matchId={matchId} spectate={spectate} />;
}

function NoMatchSelected() {
  const router = useRouter();
  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-cyan-400/30 bg-slate-950/80 p-8 text-center shadow-[0_0_50px_-20px_rgba(34,211,238,0.4)]">
        <h1 className="text-3xl font-bold">No chess match selected</h1>
        <p className="mt-4 text-slate-300">
          Find an opponent in matchmaking before opening the board.
        </p>
        <button
          type="button"
          onClick={() => router.push("/matchmaking?game=chess")}
          className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-cyan-300"
        >
          Find a chess match
        </button>
      </div>
    </main>
  );
}

function ChessMatch({
  matchId,
  spectate,
}: {
  matchId: string;
  spectate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>("connecting");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [rematchMessage, setRematchMessage] = useState<string | null>(null);
  const [opponentDisconnect, setOpponentDisconnect] = useState<{
    deadline: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [milestones, setMilestones] = useState<MatchMilestones | null>(null);
  const [achievementsUnlocked, setAchievementsUnlocked] = useState<
    AchievementRecord[]
  >([]);
  const socketRef = useRef<Socket | null>(null);

  const isSpectator = useMemo(() => {
    if (!user || !matchState) return spectate;
    return (
      matchState.white.userId !== user.id && matchState.black.userId !== user.id
    );
  }, [matchState, spectate, user]);

  const playerColor: "w" | "b" = useMemo(() => {
    if (!user || !matchState) return "w";
    if (matchState.white.userId === user.id) return "w";
    if (matchState.black.userId === user.id) return "b";
    return "w";
  }, [matchState, user]);

  const fen = matchState?.fen;
  const moveHistory = matchState?.moveHistory;

  const lastMove = useMemo(() => {
    if (!moveHistory || moveHistory.length === 0) return null;
    return moveHistory[moveHistory.length - 1];
  }, [moveHistory]);

  const captures = useMemo(
    () => (fen ? summarizeCaptures(fen) : null),
    [fen],
  );

  // Pair SAN moves into PGN turns: [["e4", "e5"], ["Nf3", "Nc6"], ...].
  const pairedMoves = useMemo(() => {
    const history = moveHistory ?? [];
    const turns: Array<{ index: number; white: string; black: string | null }> = [];
    for (let i = 0; i < history.length; i += 2) {
      turns.push({
        index: i / 2 + 1,
        white: history[i],
        black: history[i + 1] ?? null,
      });
    }
    return turns;
  }, [moveHistory]);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    async function initialize() {
      // Auth comes from the AuthProvider context, not a per-page fetch.
      // The provider already reconciles with /api/auth/me on mount, so
      // by the time this effect runs we have the authoritative answer.
      if (!authUser && !spectate) {
        toast.push({ type: "error", title: "Please log in to continue." });
        router.push("/login");
        return;
      }

      // Spectators don't need a real account; synthesize a guest id.
      const sessionUser: CurrentUser = authUser
        ? {
            id: authUser.id,
            username: authUser.username,
            email: authUser.email,
          }
        : {
            id: `guest_${Math.random().toString(36).slice(2, 10)}`,
            username: "Spectator",
            email: "",
          };

      setUser(sessionUser);
      // withCredentials: send the ba_session cookie on the WS handshake
      // so the server-side io.use(...) middleware can authenticate.
      socket = io({
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setPhase("joining");
        setStatusDetail(null);
        socket?.emit("join_match", {
          matchId,
          userId: sessionUser.id,
          username: sessionUser.username,
          spectate,
        });
      });

      socket.on("match_state", (payload: MatchState) => {
        setMatchState(payload);
        if (payload.result) {
          setPhase("ended");
        } else if (spectate) {
          setPhase("spectating");
        } else {
          setPhase("live");
        }
        setOpponentDisconnect(null);
      });

      socket.on("match_start", () => {
        setStatusDetail(null);
      });

      socket.on("match_not_found", () => {
        setPhase("error");
        setStatusDetail("This match no longer exists. It may have ended.");
      });

      socket.on("move_rejected", (error: { message: string }) => {
        toast.push({
          type: "error",
          title: "Move rejected",
          description: error.message,
        });
      });

      socket.on("match_end", (payload) => {
        setMatchState((current) =>
          current ? { ...current, result: payload.outcome } : null,
        );
        setPhase("ended");
        setOpponentDisconnect(null);
        // Per-player milestones + achievements. Spectators receive
        // a payload WITHOUT these fields, so they'll stay null/empty
        // and the banner won't render.
        if (payload?.milestones) {
          setMilestones(payload.milestones as MatchMilestones);
        }
        if (Array.isArray(payload?.achievementsUnlocked)) {
          setAchievementsUnlocked(
            payload.achievementsUnlocked as AchievementRecord[],
          );
        }
      });

      socket.on(
        "opponent_disconnected",
        (payload: { graceMs: number }) => {
          setOpponentDisconnect({
            deadline: Date.now() + payload.graceMs,
          });
        },
      );

      socket.on("opponent_reconnected", () => {
        setOpponentDisconnect(null);
        toast.push({ type: "success", title: "Opponent reconnected" });
      });

      socket.on("rematch_pending", (payload) => {
        setRematchMessage(`${payload.requestingUserName} wants a rematch.`);
      });

      socket.on("rematch_ready", (payload) => {
        router.push(`/chess?matchId=${payload.matchId}`);
      });

      socket.on("disconnect", () => {
        setPhase((p) => (p === "ended" ? p : "disconnected"));
        setStatusDetail("Reconnecting…");
      });
    }

    initialize();

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [matchId, router, toast, spectate, authUser]);

  // Tick the local clock every 200ms while either the disconnect grace
  // timer or the chess move clock is running. Both countdowns are
  // derived in render from `now` so we never call setState in an effect.
  const clockRunning =
    Boolean(matchState?.clocks?.turnStartedAt) && !matchState?.result;

  useEffect(() => {
    if (!opponentDisconnect && !clockRunning) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [opponentDisconnect, clockRunning]);

  const graceCountdown = opponentDisconnect
    ? Math.max(0, Math.ceil((opponentDisconnect.deadline - now) / 1000))
    : null;

  // Local interpolation: subtract wall-clock elapsed since the server's
  // turnStartedAt from the active player's bank. serverNow lets us
  // ignore most clock-skew between server and client.
  const displayedClocks = useMemo<{
    whiteMs: number;
    blackMs: number;
  } | null>(() => {
    const c = matchState?.clocks;
    if (!c) return null;
    if (c.turnStartedAt === 0 || matchState?.result) {
      return { whiteMs: c.whiteMs, blackMs: c.blackMs };
    }
    const serverNow = matchState?.serverNow ?? c.turnStartedAt;
    // Time elapsed since server's turn start (in client-wall-clock).
    const elapsed = Math.max(0, now - serverNow + (serverNow - c.turnStartedAt));
    if (matchState?.turn === "w") {
      return {
        whiteMs: Math.max(0, c.whiteMs - elapsed),
        blackMs: c.blackMs,
      };
    }
    return {
      whiteMs: c.whiteMs,
      blackMs: Math.max(0, c.blackMs - elapsed),
    };
  }, [matchState?.clocks, matchState?.result, matchState?.serverNow, matchState?.turn, now]);

  function handleMove({
    from,
    to,
    promotion,
  }: {
    from: string;
    to: string;
    promotion?: "q" | "r" | "b" | "n";
  }) {
    if (!socketRef.current || !matchId || !user || isSpectator) return;
    socketRef.current.emit("make_move", { matchId, from, to, promotion });
  }

  function offerDraw() {
    if (!socketRef.current || !matchId || !user || isSpectator) return;
    socketRef.current.emit("offer_draw", { matchId, userId: user.id });
    setRematchMessage("Draw offer sent. Waiting for opponent.");
  }

  function resign() {
    if (!socketRef.current || !matchId || !user || isSpectator) return;
    socketRef.current.emit("resign", { matchId, userId: user.id });
  }

  function requestRematch() {
    if (!socketRef.current || !matchId || !user || isSpectator) return;
    socketRef.current.emit("request_rematch", { matchId, userId: user.id });
    setRematchMessage("Rematch requested.");
  }

  const result = matchState?.result;
  const isYourTurn =
    !isSpectator && matchState ? matchState.turn === playerColor : false;
  const opponentName =
    matchState && user
      ? matchState.white.userId === user.id
        ? matchState.black.username
        : matchState.white.username
      : null;

  const phaseLabel: Record<ConnectionPhase, string> = {
    connecting: "Connecting…",
    joining: "Joining match…",
    live: result ? "Match ended" : isYourTurn ? "Your move" : "Opponent's move",
    spectating: "Spectating",
    ended: "Match ended",
    disconnected: "Reconnecting…",
    error: "Match unavailable",
  };

  const statusToneClass =
    phase === "error"
      ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
      : phase === "ended"
      ? "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200"
      : phase === "disconnected"
      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
      : isYourTurn
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
      : "border-cyan-400/20 bg-black/30 text-cyan-200";

  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-6 text-white sm:py-10">
      <div className="mx-auto grid max-w-7xl gap-6 px-1 sm:px-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <section className="space-y-6 rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-4 shadow-[0_0_40px_-20px_rgba(34,211,238,0.4)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70 sm:text-xs">
                Chess Duel{isSpectator ? " · Spectating" : ""}
              </p>
              <h1 className="mt-2 truncate text-2xl font-bold sm:text-3xl">
                {matchState
                  ? `${matchState.white.username} vs ${matchState.black.username}`
                  : "Match loading…"}
              </h1>
              {opponentName && !isSpectator && (
                <p className="mt-1 text-sm text-slate-400">
                  You play{" "}
                  <span className="font-semibold text-cyan-200">
                    {playerColor === "w" ? "White" : "Black"}
                  </span>{" "}
                  vs{" "}
                  <span className="font-semibold text-white">{opponentName}</span>
                </p>
              )}
            </div>
            <div
              className={`rounded-2xl border px-4 py-2 text-sm transition-colors ${statusToneClass}`}
            >
              <span className="font-semibold">{phaseLabel[phase]}</span>
              {statusDetail && (
                <span className="block text-[11px] opacity-80">
                  {statusDetail}
                </span>
              )}
            </div>
          </div>

          {opponentDisconnect && !result && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100"
            >
              Opponent disconnected. Auto-forfeit in{" "}
              <span className="font-bold">{graceCountdown ?? 0}s</span> if they
              don&apos;t reconnect.
            </div>
          )}

          {matchState && displayedClocks && (
            <div className="grid grid-cols-2 gap-3">
              <ClockPanel
                label={matchState.white.username}
                color="White"
                ms={displayedClocks.whiteMs}
                running={
                  clockRunning && matchState.turn === "w" && !result
                }
                youAreActive={!isSpectator && playerColor === "w"}
                // White's panel shows pieces white has captured, plus
                // white's net material advantage.
                captured={captures?.byWhite ?? []}
                materialDelta={captures?.whiteAdvantage ?? 0}
              />
              <ClockPanel
                label={matchState.black.username}
                color="Black"
                ms={displayedClocks.blackMs}
                running={
                  clockRunning && matchState.turn === "b" && !result
                }
                youAreActive={!isSpectator && playerColor === "b"}
                captured={captures?.byBlack ?? []}
                materialDelta={
                  captures ? -captures.whiteAdvantage : 0
                }
              />
            </div>
          )}

          {phase === "error" ? (
            <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 p-8 text-center text-rose-100">
              <p className="text-lg font-semibold">Match unavailable</p>
              <p className="mt-2 text-sm text-rose-200/80">
                {statusDetail ?? "We couldn't reach the match."}
              </p>
              <button
                type="button"
                onClick={() => router.push("/matchmaking?game=chess")}
                className="mt-5 rounded-2xl bg-cyan-400 px-5 py-2 text-sm font-bold text-black hover:bg-cyan-300"
              >
                Find another match
              </button>
            </div>
          ) : matchState ? (
            <ChessBoard
              fen={matchState.fen}
              playerColor={playerColor}
              turn={matchState.turn}
              onMove={handleMove}
              lastMoveSan={lastMove}
              disabled={Boolean(result) || isSpectator}
            />
          ) : (
            <div className="grid place-items-center rounded-3xl border border-slate-800 bg-slate-900/60 p-10 text-center text-slate-400">
              <div className="space-y-3">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                <p>Waiting for match data…</p>
              </div>
            </div>
          )}

          {matchState && (
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <span className="font-semibold text-white">Match:</span>{" "}
                  <span className="font-mono text-xs text-slate-400">
                    {matchId}
                  </span>
                </span>
                {!isSpectator && (
                  <span>
                    <span className="font-semibold text-white">Your color:</span>{" "}
                    {playerColor === "w" ? "White" : "Black"}
                  </span>
                )}
              </div>
              <div>
                <p className="font-semibold text-white">Moves</p>
                {pairedMoves.length === 0 ? (
                  <p className="mt-1 text-slate-500">No moves yet.</p>
                ) : (
                  <ol className="mt-1 grid max-h-40 grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-1 overflow-y-auto pr-1 font-mono text-xs sm:text-sm">
                    {pairedMoves.map((turn) => {
                      const isLastTurn = turn.index === pairedMoves.length;
                      const lastMoveIsBlack = matchState.moveHistory.length % 2 === 0;
                      return (
                        <Fragment key={turn.index}>
                          <li className="text-slate-500">{turn.index}.</li>
                          <span
                            className={`truncate ${
                              isLastTurn && !lastMoveIsBlack
                                ? "text-cyan-200 font-semibold"
                                : "text-slate-200"
                            }`}
                          >
                            {turn.white}
                          </span>
                          <span
                            className={`truncate ${
                              isLastTurn && lastMoveIsBlack
                                ? "text-cyan-200 font-semibold"
                                : "text-slate-200"
                            }`}
                          >
                            {turn.black ?? "…"}
                          </span>
                        </Fragment>
                      );
                    })}
                  </ol>
                )}
              </div>
              {result && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3 text-fuchsia-100">
                    <p className="font-semibold uppercase tracking-widest text-fuchsia-200">
                      {result.outcome === "draw"
                        ? "Draw"
                        : isSpectator
                        ? result.winnerId === matchState.white.userId
                          ? `${matchState.white.username} wins`
                          : `${matchState.black.username} wins`
                        : result.winnerId === user?.id
                        ? "Victory"
                        : "Defeat"}
                    </p>
                    {result.reason && (
                      <p className="mt-1 text-sm text-fuchsia-200/80">
                        {result.reason}
                      </p>
                    )}
                  </div>
                  <ChessMatchEndExtras
                    milestones={milestones}
                    achievementsUnlocked={achievementsUnlocked}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-6 rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-4 shadow-[0_0_40px_-20px_rgba(34,211,238,0.4)] sm:p-6">
          {!isSpectator ? (
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
              <h2 className="text-lg font-semibold text-white">Controls</h2>
              <button
                type="button"
                onClick={offerDraw}
                disabled={Boolean(result)}
                className="w-full rounded-2xl border border-slate-700 bg-cyan-500/10 px-4 py-3 text-left text-sm text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Offer draw
              </button>
              <button
                type="button"
                onClick={resign}
                disabled={Boolean(result)}
                className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200 transition hover:border-red-400/60 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Resign
              </button>
              <button
                type="button"
                onClick={requestRematch}
                disabled={!result}
                className="w-full rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-3 text-left text-sm text-fuchsia-100 transition hover:border-fuchsia-400/60 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Request rematch
              </button>
              {rematchMessage ? (
                <p className="text-sm text-cyan-200">{rematchMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
              <h2 className="text-lg font-semibold text-white">Spectator mode</h2>
              <p className="text-sm text-slate-400">
                You&apos;re watching this match live. Moves replay in real time.
              </p>
            </div>
          )}

          <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="text-lg font-semibold text-white">Match details</h2>
            <p className="text-sm text-slate-400">
              Moves are validated server-side; illegal positions are impossible.
            </p>
            <p className="text-sm text-slate-400">
              Brief disconnects have a 30s grace before auto-forfeit.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ClockPanel({
  label,
  color,
  ms,
  running,
  youAreActive,
  captured,
  materialDelta,
}: {
  label: string;
  color: "White" | "Black";
  ms: number;
  running: boolean;
  youAreActive: boolean;
  captured: string[];
  materialDelta: number;
}) {
  const low = ms <= 30_000;
  const critical = ms <= 10_000;
  const tone = critical
    ? "border-rose-400/60 bg-rose-500/15 text-rose-100"
    : low
    ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
    : running
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
    : "border-slate-700 bg-slate-900/80 text-slate-200";

  return (
    <div
      className={`rounded-2xl border px-4 py-3 transition-colors ${tone} ${
        running ? "shadow-[0_0_24px_-12px_rgba(34,211,238,0.6)]" : ""
      }`}
    >
      <p className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] opacity-80">
        <span>
          {color}
          {youAreActive && <span className="ml-1 text-cyan-300">· you</span>}
        </span>
        {running && (
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${
              critical ? "bg-rose-400 animate-pulse" : "bg-emerald-400"
            }`}
          />
        )}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{label}</p>
      <p className="mt-1 font-mono text-3xl font-bold tabular-nums">
        {formatClock(ms)}
      </p>
      {(captured.length > 0 || materialDelta > 0) && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <div className="flex flex-1 flex-wrap gap-0.5 overflow-hidden text-base leading-none">
            {captured.map((type, i) => (
              <span
                key={`${type}-${i}`}
                className={
                  // The captured glyphs we render here are the OPPONENT's
                  // pieces, so flip their styling for clarity against
                  // the ClockPanel background.
                  color === "White"
                    ? "text-slate-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.4)]"
                    : "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
                }
              >
                {PIECE_GLYPHS[type] ?? type}
              </span>
            ))}
          </div>
          {materialDelta > 0 && (
            <span className="font-semibold opacity-80">
              +{materialDelta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ChessMatchEndExtras({
  milestones,
  achievementsUnlocked,
}: {
  milestones: MatchMilestones | null;
  achievementsUnlocked: AchievementRecord[];
}) {
  const milestoneItems = milestonesToChessLabels(milestones);
  const showAchievements = achievementsUnlocked.length > 0;
  if (milestoneItems.length === 0 && !showAchievements) return null;
  return (
    <div className="space-y-3">
      {milestoneItems.length > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-200">
            Milestones
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {milestoneItems.map((m) => (
              <li
                key={m.key}
                className="flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-100"
              >
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showAchievements && (
        <div className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-200">
            Achievement{achievementsUnlocked.length > 1 ? "s" : ""} unlocked
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {achievementsUnlocked.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-2"
              >
                <span aria-hidden className="text-2xl">
                  {a.icon}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-extrabold text-white">
                    {a.title}
                  </div>
                  <div className="text-xs text-fuchsia-100/80">
                    {a.description}
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-200/80">
                  {a.rarity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function milestonesToChessLabels(
  m: MatchMilestones | null,
): Array<{ key: string; icon: string; label: string }> {
  if (!m) return [];
  const out: Array<{ key: string; icon: string; label: string }> = [];
  if (m.firstWinEver) out.push({ key: "first", icon: "🏆", label: "First win" });
  if (m.tierPromoted) out.push({ key: "tier", icon: "📈", label: "Promoted" });
  if (m.leveledUp) out.push({ key: "level", icon: "⬆️", label: "Level up" });
  if (m.newStreakRecord)
    out.push({ key: "streak", icon: "🔥", label: "New streak record" });
  return out;
}

export default function ChessPage() {
  return (
    <Suspense fallback={null}>
      <ChessPageInner />
    </Suspense>
  );
}

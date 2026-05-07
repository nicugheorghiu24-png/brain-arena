"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getServerUser,
  getUser,
  subscribeUser,
} from "../lib/fakeAuth";
import { DEFAULT_PROFILE } from "../lib/fakeData";
import { useToast } from "../components/ui/Toast";
import { GameLayout } from "../games/components/GameLayout";
import { IntroSplash } from "../games/components/IntroSplash";
import { BattleHUD } from "../games/components/BattleHUD";
import { ResultScreen } from "../games/components/ResultScreen";
import { useGamePhase } from "../games/hooks/useGamePhase";
import { useDuelScore } from "../games/hooks/useDuelScore";
import { useGameTimer } from "../games/hooks/useGameTimer";
import { computeReward } from "../games/reward";
import { getGame } from "../games/registry";
import type { RewardSummary } from "../games/types";
import {
  getCurrentUserId,
  markQuestionsAsSeen,
  type Question,
} from "../games/questions";
import {
  createMatchSeed,
  generateMatchQuestionSetForUser,
} from "../games/match";
import { db } from "../lib/db";

const GAME_ID = "math";
const SPRINT_SECONDS = 60;
const QUEUE_SIZE = 80;
const REFILL_AT = 12;
const REFILL_AMOUNT = 40;
const FEEDBACK_MS = 320;
const BOT_MIN_MS = 2400;
const BOT_MAX_MS = 4800;
const BOT_ACCURACY = 0.78;
const OPPONENT_NAME = "PixelHawk";

export default function MathPage() {
  const toast = useToast();
  const user = useSyncExternalStore(subscribeUser, getUser, getServerUser);
  const username =
    user?.username ?? user?.email?.split("@")[0] ?? DEFAULT_PROFILE.username;

  const { phase, finish } = useGamePhase();
  const { score, result, scoreSelf, scoreOpponent } = useDuelScore();

  const meta = getGame(GAME_ID);
  const difficulty = meta?.defaultDifficulty ?? "medium";

  const [problems, setProblems] = useState<Question[]>([]);
  const [problemIdx, setProblemIdx] = useState<number>(0);
  const [matchSeed, setMatchSeed] = useState<number>(0);
  // Feedback also tracks WHICH option was picked, so we can colour just
  // the picked button and reveal the correct one — without leaking the
  // correct index into the next problem's render.
  const [feedback, setFeedback] = useState<{
    type: "correct" | "wrong";
    selectedIdx: number;
  } | null>(null);
  const [startedAt] = useState<number>(() => Date.now());
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const resultFiredRef = useRef<boolean>(false);

  // Seed the problem queue client-side. generateFreshQuestionSet is
  // deterministic given (seed, userId, seenMap), AND it filters out
  // anything the user has answered in the last 60 days. The `setSeen`
  // call after generation extends the rolling history so subsequent
  // refill batches don't repeat what we just dispatched.
  useEffect(() => {
    if (problems.length > 0) return;
    if (phase !== "playing" && phase !== "intro") return;
    const id = setTimeout(() => {
      const userId = getCurrentUserId();
      const seed = createMatchSeed();
      setMatchSeed(seed);
      const initial = generateMatchQuestionSetForUser(
        GAME_ID,
        QUEUE_SIZE,
        difficulty,
        seed,
        userId,
      );
      setProblems(initial);
      markQuestionsAsSeen(userId, initial);
    }, 0);
    return () => clearTimeout(id);
  }, [problems.length, phase, difficulty]);

  // Top up the queue if running low. Each refill batch uses a fresh seed
  // and respects the cumulative seen-history (which now includes the
  // initial batch we just dispatched).
  useEffect(() => {
    if (problems.length === 0) return;
    if (problems.length - problemIdx > REFILL_AT) return;
    const id = setTimeout(() => {
      const userId = getCurrentUserId();
      const seed = createMatchSeed();
      const more = generateMatchQuestionSetForUser(
        GAME_ID,
        REFILL_AMOUNT,
        difficulty,
        seed,
        userId,
      );
      setProblems((prev) => [...prev, ...more]);
      markQuestionsAsSeen(userId, more);
    }, 0);
    return () => clearTimeout(id);
  }, [problems.length, problemIdx, difficulty]);

  // Global sprint timer — when it expires, finish the game
  const timer = useGameTimer({
    durationSec: SPRINT_SECONDS,
    paused: phase !== "playing",
    onTimeout: () => finish(),
  });

  // Recurring bot scoring
  useEffect(() => {
    if (phase !== "playing") return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function schedule() {
      const delay = BOT_MIN_MS + Math.random() * (BOT_MAX_MS - BOT_MIN_MS);
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (Math.random() < BOT_ACCURACY) {
          scoreOpponent();
        }
        schedule();
      }, delay);
    }

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [phase, scoreOpponent]);

  // After the feedback flash, advance to the next problem AND clear
  // feedback in the same setTimeout callback so both setState calls land
  // in one render. This guarantees the next problem first appears with
  // feedback === null — no chance for the previous answer's reveal style
  // to leak onto the new problem's correct index.
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => {
      setProblemIdx((i) => i + 1);
      setFeedback(null);
    }, FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  // On result-phase entry: compute reward + toast
  useEffect(() => {
    if (phase !== "result" || resultFiredRef.current) return;
    resultFiredRef.current = true;
    const id = setTimeout(async () => {
      const durationMs = Date.now() - startedAt;
      const computed = computeReward({
        gameId: GAME_ID,
        score,
        result,
        durationMs,
        rounds: SPRINT_SECONDS,
      });
      setReward(computed);
      toast.push({
        type:
          result === "win" ? "success" : result === "draw" ? "info" : "error",
        title:
          result === "win" ? "Victory" : result === "draw" ? "Draw" : "Defeat",
        description: `${score.self} – ${score.opponent} solved vs ${OPPONENT_NAME}`,
      });
      const userId = getCurrentUserId();
      if (!userId) return;
      await db.profiles.ensureForUser({
        userId,
        username,
        email: user?.email,
      });
      await db.matches.record({
        gameId: GAME_ID,
        matchSeed,
        difficulty,
        playerId: userId,
        playerName: username,
        opponentName: OPPONENT_NAME,
        result,
        scoreSelf: score.self,
        scoreOpponent: score.opponent,
        durationMs,
        rounds: SPRINT_SECONDS,
        lpDelta: computed.lpDelta,
        xpGained: computed.xpGained,
      });
      await db.profiles.applyMatchOutcome(userId, {
        result,
        lpDelta: computed.lpDelta,
        xpGained: computed.xpGained,
      });
    }, 0);
    return () => clearTimeout(id);
  }, [
    phase,
    result,
    score,
    startedAt,
    toast,
    username,
    user?.email,
    matchSeed,
    difficulty,
  ]);

  function handleAnswer(idx: number) {
    if (phase !== "playing") return;
    if (feedback !== null) return;
    const p = problems[problemIdx];
    if (!p) return;

    const correct = idx === p.correctIndex;
    if (correct) scoreSelf();
    // Only record feedback. The advance-to-next-problem happens in the
    // effect above, batched with feedback being cleared.
    setFeedback({ type: correct ? "correct" : "wrong", selectedIdx: idx });
  }

  if (phase === "intro") {
    return (
      <IntroSplash
        yourName={username}
        opponentName={OPPONENT_NAME}
        mode={meta?.mode}
      />
    );
  }

  if (phase === "result") {
    return (
      <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-10 text-white">
        <ResultScreen
          result={result}
          yourName={username}
          opponentName={OPPONENT_NAME}
          score={score}
          reward={reward ?? undefined}
        />
      </main>
    );
  }

  // Playing
  const ready = problems.length > 0;
  const problem = ready ? problems[problemIdx] : null;
  const ringColor =
    timer.timeLeft <= 10
      ? "stroke-rose-400"
      : timer.timeLeft <= 20
        ? "stroke-amber-300"
        : "stroke-cyan-300";

  return (
    <GameLayout>
      <BattleHUD
        you={{
          name: username,
          tier: "Diamond",
          division: "II",
          isYou: true,
        }}
        opponent={{
          name: OPPONENT_NAME,
          tier: "Diamond",
          division: "I",
        }}
        score={score}
        category="math"
        status={
          timer.timeLeft <= 10
            ? `${timer.timeLeft}s left!`
            : "Sprint! Solve fast"
        }
      />

      <div
        key={`p-${problemIdx}`}
        className="page-enter relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-black to-slate-950 p-6 backdrop-blur sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl"
        />

        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24">
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 -rotate-90"
              aria-hidden
            >
              <circle
                cx="50"
                cy="50"
                r="44"
                className="stroke-white/10"
                fill="none"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r="44"
                className={`${ringColor} transition-[stroke-dashoffset] duration-300`}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 44}
                strokeDashoffset={2 * Math.PI * 44 * (1 - timer.percent / 100)}
              />
            </svg>
            <span className="font-mono text-2xl font-extrabold text-white sm:text-3xl">
              {timer.timeLeft}
            </span>
          </div>

          {problem ? (
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-cyan-300/70">
                Solve
              </div>
              <div className="mt-1 font-mono text-3xl font-extrabold text-white sm:text-5xl">
                {problem.text} = ?
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-shimmer rounded-md bg-white/5" />
              <div className="h-10 w-48 animate-shimmer rounded-md bg-white/5 sm:h-12" />
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
          {problem
            ? problem.options.map((opt, i) => {
                const isCorrect = i === problem.correctIndex;
                const isPicked = feedback?.selectedIdx === i;
                const showFeedback = feedback !== null;

                let stateClass: string;
                if (!showFeedback) {
                  // Default neutral — every button identical until pick.
                  stateClass =
                    "border-white/10 bg-white/5 text-cyan-100 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-cyan-400/10 active:scale-95";
                } else if (isCorrect) {
                  // Reveal the correct answer once locked. The picked-correct
                  // gets a slightly stronger emphasis.
                  stateClass = isPicked
                    ? "border-emerald-400/70 bg-emerald-500/25 text-emerald-100 scale-[1.02]"
                    : "border-emerald-400/50 bg-emerald-500/15 text-emerald-200";
                } else if (isPicked) {
                  // Player picked this and it was wrong.
                  stateClass =
                    "border-rose-400/60 bg-rose-500/20 text-rose-100";
                } else {
                  // Other (unpicked, incorrect) options stay muted.
                  stateClass =
                    "border-white/10 bg-white/5 text-cyan-100 opacity-50";
                }

                return (
                  <button
                    key={`${problemIdx}-${i}`}
                    type="button"
                    onClick={() => handleAnswer(i)}
                    disabled={showFeedback}
                    className={`flex items-center justify-center rounded-xl border px-4 py-5 font-mono text-2xl font-extrabold transition-all duration-150 disabled:cursor-not-allowed sm:py-6 sm:text-3xl ${stateClass}`}
                  >
                    {opt}
                  </button>
                );
              })
            : Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 w-full animate-shimmer rounded-xl border border-white/10 bg-white/5 sm:h-20"
                />
              ))}
        </div>
      </div>
    </GameLayout>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { DEFAULT_PROFILE } from "../lib/fakeData";
import { useToast } from "../components/ui/Toast";
import { GameLayout } from "../games/components/GameLayout";
import { IntroSplash } from "../games/components/IntroSplash";
import { BattleHUD } from "../games/components/BattleHUD";
import { ResultScreen } from "../games/components/ResultScreen";
import { useGamePhase } from "../games/hooks/useGamePhase";
import { useDuelScore } from "../games/hooks/useDuelScore";
import { computeReward } from "../games/reward";
import { getGame } from "../games/registry";
import type { RewardSummary } from "../games/types";
import { createMatchSeed } from "../games/match";
import { resolveSeenUserId } from "../games/questions";
import { recordSoloMatchOutcome } from "../lib/matchClient";

const GAME_ID = "reaction";
const TOTAL_ROUNDS = 5;
const ARMING_MS = 700;
const WAIT_MIN_MS = 1000;
const WAIT_MAX_MS = 3500;
const REVEAL_MS = 1700;
const BOT_RT_MIN = 210;
const BOT_RT_MAX = 420;
const MAX_PLAYER_RT = 1500;
const FALSE_START_RT = -1;
const OPPONENT_NAME = "PixelHawk";

type SubPhase = "arming" | "waiting" | "go" | "reveal";
type RoundResult = "you" | "opp" | "draw" | "false-start";

export default function ReactionPage() {
  const toast = useToast();
  const { user } = useAuth();
  const username =
    user?.username ?? user?.email?.split("@")[0] ?? DEFAULT_PROFILE.username;

  const { phase, finish } = useGamePhase();
  const { score, result, scoreSelf, scoreOpponent } = useDuelScore();

  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [subPhase, setSubPhase] = useState<SubPhase>("arming");
  const [goAt, setGoAt] = useState<number>(0);
  const [playerRt, setPlayerRt] = useState<number | null>(null);
  const [botRt, setBotRt] = useState<number | null>(null);
  const [history, setHistory] = useState<RoundResult[]>([]);
  const [startedAt] = useState<number>(() => Date.now());
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [matchSeed, setMatchSeed] = useState<number>(0);
  const resultFiredRef = useRef<boolean>(false);

  // Match seed for record-keeping (this game doesn't use seeded
  // questions). Generated client-side once.
  useEffect(() => {
    if (matchSeed !== 0) return;
    const id = setTimeout(() => setMatchSeed(createMatchSeed()), 0);
    return () => clearTimeout(id);
  }, [matchSeed]);

  // arming → waiting
  useEffect(() => {
    if (phase !== "playing") return;
    if (subPhase !== "arming") return;
    const id = setTimeout(() => setSubPhase("waiting"), ARMING_MS);
    return () => clearTimeout(id);
  }, [phase, subPhase, roundIdx]);

  // waiting → go (random delay)
  useEffect(() => {
    if (phase !== "playing") return;
    if (subPhase !== "waiting") return;
    const delay = WAIT_MIN_MS + Math.random() * (WAIT_MAX_MS - WAIT_MIN_MS);
    const id = setTimeout(() => {
      setGoAt(Date.now());
      setSubPhase("go");
    }, delay);
    return () => clearTimeout(id);
  }, [phase, subPhase, roundIdx]);

  // go: schedule bot reaction + slow-player cap
  useEffect(() => {
    if (phase !== "playing") return;
    if (subPhase !== "go") return;
    const botMs = BOT_RT_MIN + Math.random() * (BOT_RT_MAX - BOT_RT_MIN);
    const botId = setTimeout(() => {
      setBotRt(Math.round(botMs));
    }, botMs);
    const slowId = setTimeout(() => {
      setPlayerRt((prev) => prev ?? MAX_PLAYER_RT);
    }, MAX_PLAYER_RT);
    return () => {
      clearTimeout(botId);
      clearTimeout(slowId);
    };
  }, [phase, subPhase, roundIdx]);

  // Resolve round when both reactions are in (or false start)
  useEffect(() => {
    if (phase !== "playing") return;
    if (subPhase !== "waiting" && subPhase !== "go") return;
    const ready =
      playerRt === FALSE_START_RT ||
      (playerRt !== null && botRt !== null);
    if (!ready) return;

    const id = setTimeout(() => {
      let winner: RoundResult;
      if (playerRt === FALSE_START_RT) {
        winner = "false-start";
      } else if ((playerRt as number) < (botRt as number)) {
        winner = "you";
      } else if ((playerRt as number) > (botRt as number)) {
        winner = "opp";
      } else {
        winner = "draw";
      }
      setHistory((h) => [...h, winner]);
      if (winner === "you") scoreSelf();
      else if (winner === "opp" || winner === "false-start") scoreOpponent();
      setSubPhase("reveal");
    }, 0);
    return () => clearTimeout(id);
  }, [phase, subPhase, playerRt, botRt, scoreSelf, scoreOpponent]);

  // reveal → next round or finish
  useEffect(() => {
    if (phase !== "playing") return;
    if (subPhase !== "reveal") return;
    const id = setTimeout(() => {
      if (roundIdx >= TOTAL_ROUNDS - 1) {
        finish();
      } else {
        setRoundIdx((i) => i + 1);
        setSubPhase("arming");
        setPlayerRt(null);
        setBotRt(null);
        setGoAt(0);
      }
    }, REVEAL_MS);
    return () => clearTimeout(id);
  }, [phase, subPhase, roundIdx, finish]);

  // result-phase entry: compute reward, fire toast, persist match
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
        rounds: TOTAL_ROUNDS,
      });
      setReward(computed);
      toast.push({
        type:
          result === "win" ? "success" : result === "draw" ? "info" : "error",
        title:
          result === "win" ? "Victory" : result === "draw" ? "Draw" : "Defeat",
        description: `${score.self} – ${score.opponent} rounds vs ${OPPONENT_NAME}`,
      });
      const userId = resolveSeenUserId(user);
      if (!userId) return;
      const recorded = await recordSoloMatchOutcome(
        {
          gameId: GAME_ID,
          difficulty: "medium",
          rounds: TOTAL_ROUNDS,
          durationMs,
          result,
          scoreSelf: score.self,
          scoreOpponent: score.opponent,
          opponentName: OPPONENT_NAME,
          matchSeed,
        },
        {
          userId,
          username,
          email: user?.email,
          optimisticLpDelta: computed.lpDelta,
          optimisticXpGained: computed.xpGained,
        },
      );
      setReward({
        lpDelta: recorded.reward.lpDelta,
        xpGained: recorded.reward.xpGained,
        levelUp: false,
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
    user,
    matchSeed,
  ]);

  function handleClick() {
    if (phase !== "playing") return;
    if (subPhase === "arming" || subPhase === "reveal") return;
    if (playerRt !== null) return;

    if (subPhase === "waiting") {
      setPlayerRt(FALSE_START_RT);
      return;
    }
    if (subPhase === "go") {
      const rt = Date.now() - goAt;
      setPlayerRt(rt);
    }
  }

  if (phase === "intro") {
    const meta = getGame(GAME_ID);
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
  const lastResult = history[history.length - 1];
  const playerWaiting =
    subPhase === "go" && playerRt !== null && botRt === null;

  let targetLabel = "Get ready";
  let targetSub = "Watch for green";
  let targetClass = "border-white/15 bg-white/5";
  let textClass = "text-gray-200";

  if (subPhase === "waiting") {
    targetLabel = "Wait…";
    targetSub = "Hold — don't tap yet";
    targetClass = "border-rose-400/40 bg-rose-500/10";
    textClass = "text-rose-200";
  } else if (subPhase === "go") {
    if (playerRt !== null) {
      targetLabel =
        playerRt === MAX_PLAYER_RT ? "Too slow…" : `${playerRt}ms`;
      targetSub = "Waiting for opponent…";
      targetClass = "border-cyan-400/50 bg-cyan-500/10";
      textClass = "text-cyan-100";
    } else {
      targetLabel = "GO!";
      targetSub = "Tap NOW";
      targetClass =
        "border-emerald-400/70 bg-emerald-500/30 shadow-[0_0_60px_-10px_rgba(52,211,153,0.8)] scale-[1.02]";
      textClass = "text-emerald-50";
    }
  } else if (subPhase === "reveal") {
    if (lastResult === "you") {
      targetLabel = "You won!";
      targetSub = `${playerRt}ms vs ${botRt}ms`;
      targetClass = "border-emerald-400/60 bg-emerald-500/20";
      textClass = "text-emerald-100";
    } else if (lastResult === "opp") {
      const yourLabel =
        playerRt === MAX_PLAYER_RT ? "Too slow" : `${playerRt}ms`;
      targetLabel = "Lost";
      targetSub = `${yourLabel} vs ${botRt}ms`;
      targetClass = "border-rose-400/60 bg-rose-500/20";
      textClass = "text-rose-100";
    } else if (lastResult === "draw") {
      targetLabel = "Draw";
      targetSub = `Both at ${playerRt}ms`;
      targetClass = "border-cyan-400/60 bg-cyan-500/20";
      textClass = "text-cyan-100";
    } else if (lastResult === "false-start") {
      targetLabel = "False start!";
      targetSub = "Wait for green next round";
      targetClass = "border-amber-400/60 bg-amber-500/20";
      textClass = "text-amber-100";
    }
  }

  const statusText =
    subPhase === "arming"
      ? "Get ready"
      : subPhase === "waiting"
        ? "Hold steady"
        : subPhase === "go"
          ? playerWaiting
            ? "Locked in"
            : "GO!"
          : "Round complete";

  const targetDisabled =
    subPhase === "arming" || subPhase === "reveal" || playerRt !== null;

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
        round={{ current: roundIdx + 1, total: TOTAL_ROUNDS }}
        category="reaction"
        status={statusText}
      />

      <div className="flex justify-center gap-2">
        {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
          const r = history[i];
          const isCurrent = i === roundIdx && !r;
          return (
            <span
              key={i}
              aria-label={r ?? "pending"}
              className={`h-3 w-3 rounded-full border transition-colors ${
                r === "you"
                  ? "border-emerald-400 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]"
                  : r === "opp"
                    ? "border-rose-400 bg-rose-400"
                    : r === "draw"
                      ? "border-cyan-400 bg-cyan-400"
                      : r === "false-start"
                        ? "border-amber-400 bg-amber-400"
                        : isCurrent
                          ? "animate-pulse border-cyan-300 bg-cyan-300/40"
                          : "border-white/15"
              }`}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={targetDisabled}
        aria-label={targetLabel}
        aria-live="polite"
        className={`mx-auto flex aspect-square w-full max-w-md select-none flex-col items-center justify-center gap-2 rounded-3xl border backdrop-blur transition-all duration-150 active:scale-95 disabled:active:scale-100 ${targetClass} ${
          targetDisabled ? "cursor-default" : "cursor-pointer"
        }`}
      >
        <div className={`text-5xl font-extrabold sm:text-7xl ${textClass}`}>
          {targetLabel}
        </div>
        <div className={`text-sm font-medium opacity-80 ${textClass}`}>
          {targetSub}
        </div>
      </button>
    </GameLayout>
  );
}

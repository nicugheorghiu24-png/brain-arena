"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { DEFAULT_PROFILE } from "../lib/fakeData";
import { useToast } from "../components/ui/Toast";
import { GameLayout } from "../games/components/GameLayout";
import { IntroSplash } from "../games/components/IntroSplash";
import { BattleHUD } from "../games/components/BattleHUD";
import { ResultScreen } from "../games/components/ResultScreen";
import { useGamePhase } from "../games/hooks/useGamePhase";
import { useGameTimer } from "../games/hooks/useGameTimer";
import { useDuelScore } from "../games/hooks/useDuelScore";
import { useOpponentBot } from "../games/hooks/useOpponentBot";
import { computeReward } from "../games/reward";
import { getGame } from "../games/registry";
import type { RewardSummary } from "../games/types";
import type { AchievementRecord } from "../lib/games/achievements-catalog";
import {
  resolveSeenUserId,
  markQuestionsAsSeen,
  type Question,
} from "../games/questions";
import {
  generateDeterministicQuestionSet,
} from "../games/match";
import { recordSoloMatchOutcome, type MatchMilestones } from "../lib/matchClient";

// One answered question, recorded for server-side replay validation.
type QuizAnswerInput = {
  questionId: string;
  chosenIndex: number;
  correctIndex: number;
  ms: number;
};

type Selection = { index: number; correct: boolean } | null;

const GAME_ID = "quiz";
const TOTAL = 5;
const QUESTION_SECONDS = 12;
const REVEAL_MS = 1500;
const OPPONENT_NAME = "PixelHawk";

function ArenaInner() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("matchId");
  const matchSeed = useMemo(() => {
    const seedStr = searchParams.get("seed");
    return seedStr ? BigInt(seedStr) : BigInt(0);
  }, [searchParams]);

  const toast = useToast();
  const { user } = useAuth();
  const username =
    user?.username ?? user?.email?.split("@")[0] ?? DEFAULT_PROFILE.username;

  const { phase, finish } = useGamePhase();
  const { score, result, scoreSelf, scoreOpponent } = useDuelScore();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [startedAt] = useState<number>(() => Date.now());
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [milestones, setMilestones] = useState<MatchMilestones | null>(null);
  const [achievementsUnlocked, setAchievementsUnlocked] = useState<
    AchievementRecord[]
  >([]);
  const resultFiredRef = useRef<boolean>(false);

  // Replay-validation input stream. One entry per question the
  // player answered (or auto-resolved on timer expiry).
  const answersRef = useRef<QuizAnswerInput[]>([]);
  // Wall-clock at the moment the current question appeared.
  const questionShownAtRef = useRef<number>(0);
  useEffect(() => {
    questionShownAtRef.current = Date.now();
  }, [questionIdx]);

  const meta = getGame(GAME_ID);
  const difficulty = meta?.defaultDifficulty ?? "medium";

  // Generate the match's question set ONCE, on transition into "playing".
  // The same set is used for both player and bot — fairness contract.
  // setState lives inside a setTimeout callback, never synchronously in
  // the effect body.
  useEffect(() => {
    if (phase !== "playing") return;
    if (questions.length > 0) return;
    const id = setTimeout(() => {
      const userId = resolveSeenUserId(user);
      const set = generateDeterministicQuestionSet(
        GAME_ID,
        TOTAL,
        difficulty,
        Number(matchSeed),
      );
      setQuestions(set);
      markQuestionsAsSeen(userId, set);
    }, 0);
    return () => clearTimeout(id);
  }, [phase, questions.length, difficulty, matchSeed, user]);

  const question = questions[questionIdx];
  const ready = question !== undefined;

  const isPlaying = phase === "playing" && ready;
  const paused = !isPlaying || selection !== null;

  const timer = useGameTimer({
    durationSec: QUESTION_SECONDS,
    paused,
    onTimeout: () => {
      setSelection((cur) => {
        if (cur !== null) return cur;
        // Auto-resolved on timeout — record as a no-pick for replay
        // validation. chosenIndex=-1 never matches any correctIndex
        // so the validator's score reconciliation stays correct.
        if (question) {
          answersRef.current.push({
            questionId: question.id,
            chosenIndex: -1,
            correctIndex: question.correctIndex,
            ms: QUESTION_SECONDS * 1000,
          });
        }
        return { index: -1, correct: false };
      });
    },
  });

  useOpponentBot({
    paused,
    resetKey: questionIdx,
    accuracy: 0.55,
    minMs: 2500,
    maxMs: 7500,
    onAct: (correct) => {
      if (correct) scoreOpponent();
    },
  });

  // Reveal → advance or finish (1.5s after a selection is set)
  useEffect(() => {
    if (selection === null) return;
    const id = setTimeout(() => {
      if (questionIdx >= TOTAL - 1) {
        finish();
      } else {
        setQuestionIdx((i) => i + 1);
        setSelection(null);
        timer.reset();
      }
    }, REVEAL_MS);
    return () => clearTimeout(id);
  }, [selection, questionIdx, finish, timer]);

  // On result-phase entry: compute reward, toast, persist match, apply
  // outcome to the player's profile. Everything inside the deferred
  // callback so no setState is synchronous in the effect body.
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
        rounds: TOTAL,
      });
      setReward(computed);
      toast.push({
        type:
          result === "win" ? "success" : result === "draw" ? "info" : "error",
        title:
          result === "win" ? "Victory" : result === "draw" ? "Draw" : "Defeat",
        description: `${score.self} – ${score.opponent} vs ${OPPONENT_NAME}`,
      });
      const userId = resolveSeenUserId(user);
      if (!userId) return;
      const recorded = await recordSoloMatchOutcome(
        {
          gameId: GAME_ID,
          difficulty,
          rounds: TOTAL,
          durationMs,
          result,
          scoreSelf: score.self,
          scoreOpponent: score.opponent,
          opponentName: OPPONENT_NAME,
          matchSeed: Number(matchSeed),
          inputs: { answers: answersRef.current },
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
        levelUp: recorded.milestones?.leveledUp ?? false,
      });
      setMilestones(recorded.milestones);
      setAchievementsUnlocked(recorded.achievementsUnlocked);
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
    difficulty,
  ]);

  function pickAnswer(idx: number) {
    if (paused || !question) return;
    const correct = idx === question.correctIndex;
    // eslint-disable-next-line react-hooks/purity -- click handler, not render
    const ms = Math.max(0, Date.now() - questionShownAtRef.current);
    answersRef.current.push({
      questionId: question.id,
      chosenIndex: idx,
      correctIndex: question.correctIndex,
      ms,
    });
    setSelection({ index: idx, correct });
    if (correct) scoreSelf();
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
          milestones={milestones}
          achievementsUnlocked={achievementsUnlocked}
        />
      </main>
    );
  }

  // Playing
  const ringColor =
    timer.timeLeft <= 3
      ? "stroke-rose-400"
      : timer.timeLeft <= 6
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
        round={{ current: questionIdx + 1, total: TOTAL }}
        category={question?.category ?? "logic"}
        status={
          !ready
            ? "Loading questions…"
            : selection === null
              ? "Choose…"
              : selection.correct
                ? "Correct ✓"
                : "Wrong ✕"
        }
      />

      <div
        key={`q-${questionIdx}`}
        className="page-enter relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-black to-slate-950 p-6 backdrop-blur sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl"
        />

        <div className="flex items-start gap-4">
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
                className={`${ringColor} transition-[stroke-dashoffset] duration-1000`}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 44}
                strokeDashoffset={2 * Math.PI * 44 * (1 - timer.percent / 100)}
              />
            </svg>
            <span className="font-mono text-2xl font-extrabold text-white sm:text-3xl">
              {ready ? timer.timeLeft : "—"}
            </span>
          </div>

          {ready ? (
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-cyan-300/70">
                Question {questionIdx + 1}
              </div>
              <h2 className="mt-1 text-xl font-extrabold leading-tight text-white sm:text-2xl">
                {question.text}
              </h2>
            </div>
          ) : (
            <div className="flex-1 space-y-3">
              <div className="h-3 w-28 animate-shimmer rounded-md bg-white/5" />
              <div className="h-6 w-full animate-shimmer rounded-md bg-white/5" />
              <div className="h-6 w-3/4 animate-shimmer rounded-md bg-white/5" />
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {ready
            ? question.options.map((opt, i) => {
                const reveal = selection !== null;
                const isCorrect = i === question.correctIndex;
                const isPicked = selection?.index === i;

                let stateClass: string;
                if (!reveal) {
                  stateClass =
                    "border-white/10 bg-white/5 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-cyan-400/10";
                } else if (isCorrect) {
                  stateClass = isPicked
                    ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                    : "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
                } else if (isPicked) {
                  stateClass =
                    "border-rose-400/60 bg-rose-500/10 text-rose-100";
                } else {
                  stateClass =
                    "border-white/10 bg-white/5 opacity-50";
                }

                return (
                  <button
                    key={`${questionIdx}-${i}`}
                    type="button"
                    disabled={reveal}
                    onClick={() => pickAnswer(i)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all duration-200 disabled:cursor-default ${stateClass}`}
                  >
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                        reveal && isCorrect
                          ? "border-emerald-300/60 text-emerald-200"
                          : reveal && isPicked
                            ? "border-rose-300/60 text-rose-200"
                            : "border-white/15 text-gray-300"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })
            : Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 w-full animate-shimmer rounded-xl border border-white/10 bg-white/5"
                />
              ))}
        </div>

        {selection !== null && (
          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${
              selection.correct
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-rose-400/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            {selection.correct
              ? "Correct! +1"
              : selection.index === -1
                ? "Time's up"
                : "Wrong answer"}
            {questionIdx < TOTAL - 1 && " · advancing…"}
          </div>
        )}
      </div>
    </GameLayout>
  );
}

export default function ArenaPage() {
  return (
    <Suspense fallback={null}>
      <ArenaInner />
    </Suspense>
  );
}

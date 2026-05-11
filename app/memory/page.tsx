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
import type { AchievementRecord } from "../lib/games/achievements-catalog";
import { MemoryCard } from "../components/games/memory/MemoryCard";
import { createMatchSeed } from "../games/match";
import { resolveSeenUserId } from "../games/questions";
import { recordSoloMatchOutcome, type MatchMilestones } from "../lib/matchClient";

// A single player turn — recorded for server-side replay
// validation. cardA / cardB are slot indices (0..15) and ms is
// time elapsed between selecting cardA and resolving cardB.
type PlayerTurn = {
  cardA: number;
  cardB: number;
  ms: number;
  matched: boolean;
};

const GAME_ID = "memory";
const SYMBOLS = ["🧠", "⚡", "💎", "🔥", "🌐", "🎯", "🛡️", "⚔️"] as const;
const TOTAL_PAIRS = SYMBOLS.length;
const TOTAL_CARDS = TOTAL_PAIRS * 2;

const REVEAL_MS = 850;
const BOT_PRE_PICK_MS = 800;
const BOT_BETWEEN_PICKS_MS = 600;
const BOT_REMEMBER_PROB = 0.7;
const BOT_USE_MEMORY_PROB = 0.6;

const OPPONENT_NAME = "PixelHawk";

type Card = {
  id: number;
  value: string;
  matched: boolean;
  flipped: boolean;
};

type Turn = "you" | "opp";

type BotMemory = Record<string, number[]>;

function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(): Card[] {
  const order = shuffledIndices(TOTAL_CARDS);
  return order.map((srcIndex, slot) => ({
    id: slot,
    value: SYMBOLS[Math.floor(srcIndex / 2)],
    matched: false,
    flipped: false,
  }));
}

function rememberCard(memory: BotMemory, value: string, id: number): BotMemory {
  const list = memory[value] ?? [];
  if (list.includes(id)) return memory;
  return { ...memory, [value]: [...list, id] };
}

function findRememberedPair(
  memory: BotMemory,
  cards: Card[],
): [number, number] | null {
  for (const ids of Object.values(memory)) {
    const usable = ids.filter((id) => !cards[id].matched);
    if (usable.length >= 2) {
      return [usable[0], usable[1]];
    }
  }
  return null;
}

function pickRandomTwo(
  cards: Card[],
  excludeId: number | null = null,
): [number, number] | null {
  const available = cards
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => !c.matched && !c.flipped && i !== excludeId)
    .map(({ i }) => i);
  if (available.length < 2 && excludeId === null) return null;
  if (excludeId !== null && available.length < 1) return null;

  const a = available[Math.floor(Math.random() * available.length)];
  if (excludeId !== null) {
    return [excludeId, a];
  }
  const remaining = available.filter((i) => i !== a);
  const b = remaining[Math.floor(Math.random() * remaining.length)];
  return [a, b];
}

export default function MemoryPage() {
  const toast = useToast();
  const { user } = useAuth();
  const username =
    user?.username ?? user?.email?.split("@")[0] ?? DEFAULT_PROFILE.username;

  const { phase, finish } = useGamePhase();
  const { score, result, scoreSelf, scoreOpponent } = useDuelScore();

  // Cards start empty — Math.random() must run client-side only to avoid
  // hydration mismatches. We seed the deck in a setTimeout-deferred effect.
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [turn, setTurn] = useState<Turn>("you");
  const [botMemory, setBotMemory] = useState<BotMemory>({});
  const [startedAt] = useState<number>(() => Date.now());
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [matchSeed, setMatchSeed] = useState<number>(0);
  const [milestones, setMilestones] = useState<MatchMilestones | null>(null);
  const [achievementsUnlocked, setAchievementsUnlocked] = useState<
    AchievementRecord[]
  >([]);
  const resultFiredRef = useRef<boolean>(false);

  // Replay-validation input stream. Each completed PLAYER turn is
  // pushed here when its two cards resolve (match-or-flip-back). Bot
  // turns are excluded — the server only validates the player's
  // claimed score against their own turns.
  const turnsRef = useRef<PlayerTurn[]>([]);
  // Wall-clock timestamp at the moment the player flipped their
  // FIRST card this turn. Used to compute per-turn ms.
  const turnStartedAtRef = useRef<number>(0);

  // Match seed (for record-keeping; this game doesn't use seeded
  // questions). Generated client-side once to avoid SSR/CSR mismatch.
  useEffect(() => {
    if (matchSeed !== 0) return;
    const id = setTimeout(() => setMatchSeed(createMatchSeed()), 0);
    return () => clearTimeout(id);
  }, [matchSeed]);

  // Seed deck client-side
  useEffect(() => {
    if (cards.length > 0) return;
    const id = setTimeout(() => setCards(buildDeck()), 0);
    return () => clearTimeout(id);
  }, [cards.length]);

  // Pair-resolution: when 2 cards selected, after REVEAL_MS, mark match
  // or flip back. Decide whose turn comes next. While the player has just
  // revealed two cards, the bot also gets a probabilistic chance to
  // memorize each value.
  useEffect(() => {
    if (selected.length !== 2) return;
    if (cards.length === 0) return;
    const [a, b] = selected;
    const matched = cards[a].value === cards[b].value;

    // Record this turn's outcome for replay validation. We snapshot
    // the ms BEFORE the reveal-flip-back delay so the recorded ms is
    // pick-time, not pick-time + animation. Only player turns are
    // recorded — bot turns aren't part of replay validation.
    if (turn === "you") {
      const ms = Math.max(0, Date.now() - turnStartedAtRef.current);
      turnsRef.current.push({ cardA: a, cardB: b, ms, matched });
    }

    const id = setTimeout(() => {
      setCards((prev) =>
        prev.map((c, i) =>
          i === a || i === b
            ? matched
              ? { ...c, matched: true, flipped: true }
              : { ...c, flipped: false }
            : c,
        ),
      );
      if (matched) {
        if (turn === "you") scoreSelf();
        else scoreOpponent();
      } else {
        setTurn((t) => (t === "you" ? "opp" : "you"));
      }
      if (turn === "you") {
        const valA = cards[a].value;
        const valB = cards[b].value;
        setBotMemory((prev) => {
          let next = prev;
          if (Math.random() < BOT_REMEMBER_PROB) {
            next = rememberCard(next, valA, a);
          }
          if (Math.random() < BOT_REMEMBER_PROB) {
            next = rememberCard(next, valB, b);
          }
          return next;
        });
      }
      setSelected([]);
    }, REVEAL_MS);
    return () => clearTimeout(id);
  }, [selected, cards, turn, scoreSelf, scoreOpponent]);

  // Bot's first pick
  useEffect(() => {
    if (phase !== "playing") return;
    if (turn !== "opp") return;
    if (selected.length !== 0) return;
    if (cards.length === 0) return;

    const id = setTimeout(() => {
      const useMemory = Math.random() < BOT_USE_MEMORY_PROB;
      const remembered = useMemory
        ? findRememberedPair(botMemory, cards)
        : null;
      const pick = remembered ?? pickRandomTwo(cards);
      if (!pick) return;
      const [firstId] = pick;

      setCards((prev) =>
        prev.map((c, i) => (i === firstId ? { ...c, flipped: true } : c)),
      );
      setSelected([firstId]);
      setBotMemory((prev) =>
        rememberCard(prev, cards[firstId].value, firstId),
      );
    }, BOT_PRE_PICK_MS);
    return () => clearTimeout(id);
  }, [phase, turn, selected.length, cards, botMemory]);

  // Bot's second pick
  useEffect(() => {
    if (phase !== "playing") return;
    if (turn !== "opp") return;
    if (selected.length !== 1) return;
    if (cards.length === 0) return;

    const firstId = selected[0];
    const id = setTimeout(() => {
      // Try the remembered partner of the first card first
      const partners = (botMemory[cards[firstId].value] ?? []).filter(
        (idx) => idx !== firstId && !cards[idx].matched && !cards[idx].flipped,
      );
      const useMemory = Math.random() < BOT_USE_MEMORY_PROB;
      let secondId: number | null = null;

      if (useMemory && partners.length > 0) {
        secondId = partners[0];
      } else {
        const pick = pickRandomTwo(cards, firstId);
        secondId = pick ? pick[1] : null;
      }
      if (secondId === null) return;

      setCards((prev) =>
        prev.map((c, i) => (i === secondId ? { ...c, flipped: true } : c)),
      );
      setSelected([firstId, secondId]);
      setBotMemory((prev) =>
        rememberCard(prev, cards[secondId].value, secondId),
      );
    }, BOT_BETWEEN_PICKS_MS);
    return () => clearTimeout(id);
  }, [phase, turn, selected, cards, botMemory]);

  // Detect game over
  const matchedCount = cards.filter((c) => c.matched).length;
  const allMatched = cards.length > 0 && matchedCount === TOTAL_CARDS;

  useEffect(() => {
    if (!allMatched) return;
    const id = setTimeout(() => finish(), 600);
    return () => clearTimeout(id);
  }, [allMatched, finish]);

  // On result-phase entry, compute reward and toast — deferred so no
  // setState is synchronous in the effect body.
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
        rounds: TOTAL_PAIRS,
      });
      setReward(computed);
      toast.push({
        type:
          result === "win" ? "success" : result === "draw" ? "info" : "error",
        title:
          result === "win" ? "Victory" : result === "draw" ? "Draw" : "Defeat",
        description: `${score.self} – ${score.opponent} pairs vs ${OPPONENT_NAME}`,
      });
      const userId = resolveSeenUserId(user);
      if (!userId) return;
      const recorded = await recordSoloMatchOutcome(
        {
          gameId: GAME_ID,
          difficulty: "medium",
          rounds: TOTAL_PAIRS,
          durationMs,
          result,
          scoreSelf: score.self,
          scoreOpponent: score.opponent,
          opponentName: OPPONENT_NAME,
          matchSeed,
          inputs: { turns: turnsRef.current },
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
  ]);

  function handleCardClick(id: number) {
    if (phase !== "playing") return;
    if (turn !== "you") return;
    if (selected.length >= 2) return;
    const card = cards[id];
    if (!card || card.matched || card.flipped) return;

    // First click of this player turn — stamp the timer.
    if (selected.length === 0) {
      // eslint-disable-next-line react-hooks/purity -- click handler, not render
      turnStartedAtRef.current = Date.now();
    }

    setCards((prev) =>
      prev.map((c, i) => (i === id ? { ...c, flipped: true } : c)),
    );
    setSelected((prev) => [...prev, id]);
  }

  function statusText(): string {
    if (selected.length === 2) {
      const [a, b] = selected;
      return cards[a]?.value === cards[b]?.value ? "Match!" : "Miss";
    }
    if (turn === "you") {
      return selected.length === 1 ? "Pick another" : "Your turn";
    }
    return selected.length > 0 ? "Opponent picking…" : "Opponent's turn";
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
          milestones={milestones}
          achievementsUnlocked={achievementsUnlocked}
        />
      </main>
    );
  }

  // Playing
  const ready = cards.length > 0;
  const playerLocked = turn !== "you" || selected.length >= 2;

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
        category="memory"
        status={statusText()}
      />

      <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-black to-slate-950 p-3 backdrop-blur sm:p-5">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-mono text-gray-400">
            Pairs {matchedCount / 2} / {TOTAL_PAIRS}
          </span>
          <span
            className={`font-semibold ${
              turn === "you" ? "text-cyan-200" : "text-fuchsia-200"
            }`}
          >
            {turn === "you" ? "Your turn" : `${OPPONENT_NAME}'s turn`}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {ready
            ? cards.map((card) => (
                <MemoryCard
                  key={card.id}
                  value={card.value}
                  flipped={card.flipped}
                  matched={card.matched}
                  disabled={playerLocked}
                  onClick={() => handleCardClick(card.id)}
                />
              ))
            : Array.from({ length: TOTAL_CARDS }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square w-full animate-shimmer rounded-xl border border-white/10 bg-white/5"
                />
              ))}
        </div>
      </div>
    </GameLayout>
  );
}

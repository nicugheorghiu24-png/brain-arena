"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MatchmakingShell } from "../games/components/MatchmakingShell";
import { getGame, isKnownGame } from "../games/registry";

function MatchmakingInner() {
  const params = useSearchParams();
  const requested = params.get("game") ?? "quiz";
  const gameId = isKnownGame(requested) ? requested : "quiz";
  const meta = getGame(gameId);
  return (
    <MatchmakingShell
      gameId={gameId}
      redirectTo={meta?.routePath ?? "/arena"}
    />
  );
}

export default function MatchmakingPage() {
  return (
    <Suspense fallback={null}>
      <MatchmakingInner />
    </Suspense>
  );
}

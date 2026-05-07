"use client";

import { Fragment, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";

const PIECE_ICONS: Record<string, string> = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

type Move = {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
};

type Props = {
  fen: string;
  playerColor: "w" | "b";
  turn: "w" | "b";
  onMove: (move: Move) => void;
  lastMoveSan?: string | null;
  disabled?: boolean;
};

type PendingPromotion = {
  from: Square;
  to: Square;
};

const PROMOTION_PIECES: Array<{
  type: "q" | "r" | "b" | "n";
  label: string;
}> = [
  { type: "q", label: "Queen" },
  { type: "r", label: "Rook" },
  { type: "b", label: "Bishop" },
  { type: "n", label: "Knight" },
];

export function ChessBoard({
  fen,
  playerColor,
  turn,
  onMove,
  lastMoveSan,
  disabled = false,
}: Props) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);

  const legalMoveDetails = useMemo(() => {
    if (!selected) return [];
    return chess.moves({ square: selected as Square, verbose: true });
  }, [chess, selected]);

  const legalMoves = useMemo(
    () => legalMoveDetails.map((move) => move.to),
    [legalMoveDetails],
  );

  const inCheck = useMemo(() => chess.inCheck(), [chess]);

  const checkSquare = useMemo<Square | null>(() => {
    if (!inCheck) return null;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (piece && piece.type === "k" && piece.color === chess.turn()) {
          return `${FILES[f]}${8 - r}` as Square;
        }
      }
    }
    return null;
  }, [chess, inCheck]);

  const board = chess.board();
  const isYourTurn = playerColor === turn;
  const flipped = playerColor === "b";

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  function handleSquareClick(
    square: Square,
    piece: { type: string; color: string } | null,
  ) {
    if (disabled || pendingPromotion) return;

    if (selected && legalMoves.includes(square)) {
      // Promotion is detected from chess.js's verbose move list — any
      // legal move that includes a `promotion` field requires a piece
      // choice before we can dispatch.
      const candidate = legalMoveDetails.find((m) => m.to === square);
      if (candidate?.promotion) {
        setPendingPromotion({ from: selected, to: square });
        return;
      }
      onMove({ from: selected, to: square });
      setSelected(null);
      return;
    }

    if (!piece) {
      setSelected(null);
      return;
    }

    const isOwnPiece = piece.color === playerColor;
    if (!isOwnPiece || !isYourTurn) {
      setSelected(null);
      return;
    }

    setSelected(square);
  }

  function confirmPromotion(piece: "q" | "r" | "b" | "n") {
    if (!pendingPromotion) return;
    onMove({
      from: pendingPromotion.from,
      to: pendingPromotion.to,
      promotion: piece,
    });
    setPendingPromotion(null);
    setSelected(null);
  }

  function cancelPromotion() {
    setPendingPromotion(null);
    setSelected(null);
  }

  // Cell size adapts to viewport: ~10vw on phones (so 8 cells + label fit
  // in ~85% of width), capped at 56px on desktop.
  const cellSize = "clamp(2.25rem, 10vw, 3.5rem)";
  const labelSize = "clamp(0.95rem, 3.5vw, 1.25rem)";

  return (
    <div className="relative space-y-6">
      {pendingPromotion && (
        <div
          role="dialog"
          aria-label="Choose promotion piece"
          className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-black/70 backdrop-blur-sm"
        >
          <div className="rounded-3xl border border-cyan-400/40 bg-slate-950/95 p-5 shadow-[0_0_50px_-10px_rgba(34,211,238,0.6)]">
            <p className="text-center text-xs uppercase tracking-[0.3em] text-cyan-300/80">
              Promote pawn
            </p>
            <div className="mt-3 flex items-center gap-2">
              {PROMOTION_PIECES.map((opt) => {
                const icon =
                  PIECE_ICONS[
                    playerColor === "w"
                      ? opt.type.toUpperCase()
                      : opt.type
                  ];
                const tone =
                  playerColor === "w"
                    ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    : "text-slate-900";
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => confirmPromotion(opt.type)}
                    aria-label={`Promote to ${opt.label}`}
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-amber-100/90 text-4xl transition hover:border-cyan-400 hover:scale-105 ${tone}`}
                  >
                    {icon}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={cancelPromotion}
              className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-xs uppercase tracking-widest text-slate-400 transition hover:border-rose-400/50 hover:text-rose-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto inline-block rounded-2xl border border-slate-700/80 bg-slate-900/80 p-2 shadow-[0_0_45px_-20px_rgba(34,211,238,0.5)] sm:p-3">
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `${labelSize} repeat(8, ${cellSize})`,
          }}
        >
          <div />
          {files.map((f) => (
            <div
              key={`top-${f}`}
              className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500"
            >
              {f}
            </div>
          ))}

          {ranks.map((rank) => {
            const rowIndex = 8 - rank;
            return (
              <Fragment key={`rank-${rank}`}>
                <div className="flex items-center justify-center text-[10px] font-semibold text-slate-500">
                  {rank}
                </div>
                {files.map((file) => {
                  const fileIndex = FILES.indexOf(file);
                  const cell = board[rowIndex][fileIndex];
                  const label = `${file}${rank}` as Square;
                  const isDark = (rowIndex + fileIndex) % 2 === 1;
                  const isSelected = selected === label;
                  const isLegal = legalMoves.includes(label);
                  const isCapture = isLegal && Boolean(cell);
                  const isCheckHighlight = checkSquare === label;
                  const piece = cell
                    ? PIECE_ICONS[
                        cell.color === "w" ? cell.type.toUpperCase() : cell.type
                      ]
                    : "";
                  const pieceColorClass = cell
                    ? cell.color === "w"
                      ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                      : "text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.25)]"
                    : "";

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleSquareClick(label, cell)}
                      disabled={disabled}
                      aria-label={`${label}${cell ? ` ${cell.color}${cell.type}` : ""}`}
                      style={{ fontSize: `calc(${cellSize} * 0.7)` }}
                      className={`relative flex aspect-square items-center justify-center transition-colors ${
                        isDark ? "bg-emerald-900/80" : "bg-amber-100/90"
                      } ${isSelected ? "ring-2 ring-cyan-300 ring-inset" : ""} ${
                        isCheckHighlight ? "ring-2 ring-rose-400 ring-inset" : ""
                      } ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:brightness-110"}`}
                    >
                      {piece && <span className={pieceColorClass}>{piece}</span>}
                      {isLegal && !isCapture && (
                        <span className="pointer-events-none absolute h-3 w-3 rounded-full bg-cyan-400/70 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
                      )}
                      {isCapture && (
                        <span className="pointer-events-none absolute inset-1 rounded-lg ring-2 ring-fuchsia-400/80" />
                      )}
                    </button>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-slate-300 sm:text-base">
        <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">Turn</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {turn === "w" ? "White" : "Black"}
          </p>
          <p
            className={`text-xs ${
              isYourTurn && !disabled ? "text-emerald-300" : "text-slate-500"
            }`}
          >
            {disabled
              ? "Match ended"
              : isYourTurn
              ? inCheck
                ? "Your move — you are in check"
                : "Your move"
              : "Waiting for opponent"}
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">Selected</p>
          <p className="mt-2 text-lg font-semibold text-white">{selected ?? "None"}</p>
          <p className="text-xs text-slate-500">
            {lastMoveSan ? `Last move: ${lastMoveSan}` : "Tap a piece to preview moves"}
          </p>
        </div>
      </div>
    </div>
  );
}

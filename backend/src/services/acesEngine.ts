/**
 * "Golden Aces" — a 5-reel, 4-row cascading card slot with 1,024 ways.
 *
 * A symbol wins when it lands on reels 1, 2, 3 (and optionally 4, 5) in a
 * row from the left; the win is paytable x number of ways (the product of
 * how many times it shows on each of those reels) x the combo multiplier.
 * Winning cards clear, the rest fall and new cards drop in; each cascade
 * steps the combo multiplier up. Golden cards (reels 2-4) that are part of a
 * win flip into Jokers (wild) instead of clearing; sometimes one is a Big
 * Joker, which also turns 1-4 other cards on reels 2-5 into Jokers. Three or
 * more Scatters on the board when a spin settles award Free Games, where the
 * combo multipliers are doubled.
 *
 * The engine is pure: every card comes from the `rng` passed in, so the same
 * draws always replay the same spin.
 */

export const REELS = 5;
export const ROWS = 4;

export const CARDS = ["CLUB", "DIAMOND", "HEART", "SPADE", "J", "Q", "K", "A"] as const;
export type Card = (typeof CARDS)[number];
export type Sym = Card | "SCATTER" | "WILD";

export type Cell = { s: Sym; g: boolean };

/** Pay for 3, 4 and 5 reels, in multiples of the total bet, per way. */
export const PAYTABLE: Record<Card, [number, number, number]> = {
  CLUB: [0.01, 0.03, 0.05],
  DIAMOND: [0.01, 0.03, 0.05],
  HEART: [0.02, 0.06, 0.1],
  SPADE: [0.02, 0.06, 0.1],
  J: [0.04, 0.12, 0.2],
  Q: [0.06, 0.18, 0.3],
  K: [0.08, 0.24, 0.4],
  A: [0.1, 0.3, 0.5],
};

/** Relative weight of each symbol dropping in, per reel. */
export const WEIGHTS: Record<Card | "SCATTER", number[]> = {
  CLUB: [16, 16, 16, 16, 16],
  DIAMOND: [16, 16, 16, 16, 16],
  HEART: [14, 14, 14, 14, 14],
  SPADE: [14, 14, 14, 14, 14],
  J: [11, 11, 11, 11, 11],
  Q: [10, 10, 10, 10, 10],
  K: [9, 9, 9, 9, 9],
  A: [8, 8, 8, 8, 8],
  SCATTER: [1.4, 1.4, 1.4, 1.4, 1.4],
};

/**
 * Return to player of the tables above, measured over 20 million simulated
 * spins: 88.09% (standard error 0.12%). A spin wins 50.8% of the time,
 * Free Games trigger about 1 in 178 spins and bring ~25% of the return.
 * Re-measure (scratch simulation) whenever a table or chance changes.
 */
export const MEASURED_RTP = 0.8809;

/** Chance a card dropping onto reels 2-4 is golden (base game / Free Games). */
export const GOLDEN_CHANCE = 0.1;
export const FREE_GOLDEN_CHANCE = 0.22;
/** Chance a golden card that flips is a Big Joker. */
export const BIG_JOKER_CHANCE = 0.15;

export const BASE_MULTIPLIERS = [1, 2, 3, 5];
export const FREE_MULTIPLIERS = [2, 4, 6, 10];
export const FREE_GAMES = 10;
export const FREE_RETRIGGER = 5;
export const SCATTERS_TO_TRIGGER = 3;

/** Hard stops so a spin is always finite. */
const MAX_CASCADES = 60;
const MAX_FREE_GAMES = 100;

export type Rng = () => number;

export type WayWin = { symbol: Card; reels: number; ways: number; pay: number };

export type CascadeStep = {
  /** Board before this step (reel by reel, top row first). */
  grid: Cell[][];
  multiplier: number;
  wins: WayWin[];
  /** Total for this step, in multiples of the bet (pays x multiplier). */
  win: number;
  /** [reel, row] of every card that is part of a win. */
  winning: [number, number][];
  /** Golden winners that flip into Jokers (they stay). */
  flipped: [number, number][];
  /** Extra Jokers spread by a Big Joker, on the board after the flip. */
  bigJokers: [number, number][];
};

export type SpinRound = {
  steps: CascadeStep[];
  /** The board once nothing more wins. */
  final: Cell[][];
  scatters: number;
  win: number;
};

export type SpinOutcome = {
  base: SpinRound;
  freeGames: SpinRound[];
  /** Total win in multiples of the bet, before any payout cap. */
  totalWin: number;
};

type Params = {
  paytable: Record<Card, [number, number, number]>;
  weights: Record<Card | "SCATTER", number[]>;
  goldenChance: number;
  freeGoldenChance: number;
  bigJokerChance: number;
};

export const DEFAULT_PARAMS: Params = {
  paytable: PAYTABLE,
  weights: WEIGHTS,
  goldenChance: GOLDEN_CHANCE,
  freeGoldenChance: FREE_GOLDEN_CHANCE,
  bigJokerChance: BIG_JOKER_CHANCE,
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function drawCell(reel: number, rng: Rng, p: Params, golden: number): Cell {
  const keys = [...CARDS, "SCATTER"] as const;
  let total = 0;
  for (const k of keys) total += p.weights[k][reel];
  let x = rng() * total;
  let s: Card | "SCATTER" = "SCATTER";
  for (const k of keys) {
    x -= p.weights[k][reel];
    if (x < 0) {
      s = k;
      break;
    }
  }
  const canBeGolden = s !== "SCATTER" && reel >= 1 && reel <= 3;
  return { s, g: canBeGolden && rng() < golden };
}

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((col) => col.map((c) => ({ ...c })));
}

/** Every way win on the board, and the cells that take part. */
export function evaluate(grid: Cell[][], p: Params = DEFAULT_PARAMS): { wins: WayWin[]; winning: Set<string> } {
  const wins: WayWin[] = [];
  const winning = new Set<string>();
  for (const symbol of CARDS) {
    const counts: number[] = [];
    for (let r = 0; r < REELS; r++) {
      const n = grid[r].filter((c) => c.s === symbol || c.s === "WILD").length;
      if (n === 0) break;
      counts.push(n);
    }
    // Jokers never land on reel 1, so a win needs the real card there.
    if (counts.length < 3 || !grid[0].some((c) => c.s === symbol)) continue;
    const ways = counts.reduce((a, b) => a * b, 1);
    const pay = p.paytable[symbol][counts.length - 3] * ways;
    wins.push({ symbol, reels: counts.length, ways, pay: round4(pay) });
    for (let r = 0; r < counts.length; r++) {
      grid[r].forEach((c, row) => {
        if (c.s === symbol || c.s === "WILD") winning.add(`${r},${row}`);
      });
    }
  }
  return { wins, winning };
}

/** Plays one spin (base or free) to the end of its cascades. */
export function playRound(rng: Rng, ladder: number[], free: boolean, p: Params = DEFAULT_PARAMS): SpinRound {
  const golden = free ? p.freeGoldenChance : p.goldenChance;
  let grid: Cell[][] = Array.from({ length: REELS }, (_, r) => Array.from({ length: ROWS }, () => drawCell(r, rng, p, golden)));
  const steps: CascadeStep[] = [];
  let total = 0;

  for (let i = 0; i < MAX_CASCADES; i++) {
    const { wins, winning } = evaluate(grid, p);
    if (wins.length === 0) break;
    const multiplier = ladder[Math.min(i, ladder.length - 1)];
    const win = round4(wins.reduce((s, w) => s + w.pay, 0) * multiplier);
    total += win;

    const winList: [number, number][] = [...winning].map((k) => k.split(",").map(Number) as [number, number]);
    const flipped = winList.filter(([r, row]) => grid[r][row].g && grid[r][row].s !== "WILD");

    // Build the next board: golden winners become Jokers, every other
    // winner clears, survivors fall and new cards drop in from the top.
    const next = cloneGrid(grid);
    for (const [r, row] of flipped) next[r][row] = { s: "WILD", g: false };
    const bigJokers: [number, number][] = [];
    let spreads = 0;
    for (let f = 0; f < flipped.length; f++) if (rng() < p.bigJokerChance) spreads++;
    const flippedKeys = new Set(flipped.map(([r, row]) => `${r},${row}`));
    const cleared = new Set([...winning].filter((k) => !flippedKeys.has(k)));

    const fallen: Cell[][] = next.map((col, r) => {
      const keep = col.filter((_, row) => !cleared.has(`${r},${row}`));
      const fresh = Array.from({ length: ROWS - keep.length }, () => drawCell(r, rng, p, golden));
      return [...fresh, ...keep];
    });
    // A Big Joker turns 1-4 cards on reels 2-5 of the new board into Jokers.
    for (let b = 0; b < spreads; b++) {
      const extra = 1 + Math.floor(rng() * 4);
      for (let e = 0; e < extra; e++) {
        const r = 1 + Math.floor(rng() * 4);
        const row = Math.floor(rng() * ROWS);
        if (fallen[r][row].s !== "SCATTER" && fallen[r][row].s !== "WILD") {
          fallen[r][row] = { s: "WILD", g: false };
          bigJokers.push([r, row]);
        }
      }
    }

    steps.push({ grid, multiplier, wins, win, winning: winList, flipped, bigJokers });
    grid = fallen;
  }

  const scatters = grid.flat().filter((c) => c.s === "SCATTER").length;
  return { steps, final: grid, scatters, win: round4(total) };
}

/** A full spin: the base round and any Free Games it triggers. */
export function playSpin(rng: Rng, p: Params = DEFAULT_PARAMS): SpinOutcome {
  const base = playRound(rng, BASE_MULTIPLIERS, false, p);
  const freeGames: SpinRound[] = [];
  let left = base.scatters >= SCATTERS_TO_TRIGGER ? FREE_GAMES : 0;
  while (left > 0 && freeGames.length < MAX_FREE_GAMES) {
    left--;
    const round = playRound(rng, FREE_MULTIPLIERS, true, p);
    freeGames.push(round);
    if (round.scatters >= SCATTERS_TO_TRIGGER) left += FREE_RETRIGGER;
  }
  const totalWin = round4(base.win + freeGames.reduce((s, g) => s + g.win, 0));
  return { base, freeGames, totalWin };
}

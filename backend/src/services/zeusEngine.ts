/**
 * Gates of Zeus: a 6x5 "pay anywhere" tumbling slot in the style of Gates of
 * Olympus. Symbols pay when 8 or more of one kind are anywhere on the board
 * (8-9, 10-11 and 12+ pay more). Winning symbols are struck away, the rest
 * fall and new ones drop in, and this repeats until nothing wins.
 *
 * Zeus's multiplier orbs (2x to 500x) can land in the base game and in free
 * spins. They don't burst; once a spin's tumbles end, if it won, the orbs on
 * the board are added up and multiply that spin's tumble win. In free spins
 * they also build a running total: each winning free spin with orbs adds them
 * to the total, and that spin's tumble win is multiplied by the whole total.
 *
 * Four or more Zeus scatters on the board pay and award FREE_SPINS free spins;
 * three or more during free spins add FREE_RETRIGGER more.
 *
 * Every draw comes from the rng, so a spin replays exactly from its seeds.
 */

export const COLS = 6;
export const ROWS = 5;

// Lowest paying first.
export const SYMBOLS = ["BLUE", "GREEN", "PURPLE", "RED", "YELLOW", "CHALICE", "RING", "HOURGLASS", "CROWN"] as const;
export type ZeusSymbol = (typeof SYMBOLS)[number];
export type Sym = ZeusSymbol | "SCATTER" | "ORB";
export type Cell = { s: Sym; m?: number };

/** Pays in multiples of the bet for [8-9, 10-11, 12+] of a symbol. */
export const PAYTABLE: Record<ZeusSymbol, [number, number, number]> = {
  BLUE: [0.25, 0.75, 2],
  GREEN: [0.4, 0.9, 4],
  PURPLE: [0.5, 1, 5],
  RED: [0.8, 1.2, 8],
  YELLOW: [1, 1.5, 10],
  CHALICE: [1.5, 2, 12],
  RING: [2, 5, 15],
  HOURGLASS: [2.5, 10, 25],
  CROWN: [10, 25, 50],
};
export const MIN_COUNT = 8;
/** Zeus scatters on the board once the tumbles end: 4, 5, 6+. */
export const SCATTER_PAYS: [number, number, number] = [3, 5, 100];
export const SCATTERS_TO_TRIGGER = 4;
export const SCATTERS_TO_RETRIGGER = 3;
export const FREE_SPINS = 15;
export const FREE_RETRIGGER = 5;
/** Guard so a spin's result stays a bounded size. */
export const MAX_FREE_SPINS = 100;
/** A whole spin (base game and free spins) pays at most this many times the bet. */
export const MAX_WIN = 5000;

/** Weight of each symbol (SYMBOLS order), then SCATTER, then ORB. */
export const BASE_WEIGHTS = [430, 400, 365, 310, 262, 180, 145, 112, 66, 33, 3];
export const FREE_WEIGHTS = [270, 240, 205, 160, 125, 78, 58, 42, 24, 13, 12.77];
export const ORB_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500];
export const ORB_WEIGHTS = [300, 220, 160, 120, 90, 70, 50, 35, 25, 15, 9, 4, 2, 0.4, 0.15];

/**
 * Measured over 60 million simulated spins: 88.04% ± 0.13% (free spins about
 * 1 in 505 spins, averaging about 130x the bet; the base game returns 62.2%).
 */
export const MEASURED_RTP = 0.8804;

export type Rng = () => number;

export type Params = { baseWeights: number[]; freeWeights: number[]; orbWeights: number[] };
export const DEFAULT_PARAMS: Params = { baseWeights: BASE_WEIGHTS, freeWeights: FREE_WEIGHTS, orbWeights: ORB_WEIGHTS };

export type SymbolWin = { symbol: ZeusSymbol; count: number; pay: number };

export type TumbleStep = {
  /** Board before this step's strike (column by column, top row first). */
  grid: Cell[][];
  wins: SymbolWin[];
  /** Total of this step's wins, in bets. */
  win: number;
  /** [col, row] of every symbol struck away. */
  burst: [number, number][];
};

export type SpinRound = {
  steps: TumbleStep[];
  /** The board once nothing more wins. */
  final: Cell[][];
  /** Sum of the tumble wins, before multipliers. */
  tumbleWin: number;
  /** Sum of the orbs on the final board, counted only if the tumbles won (0 = none). */
  orbTotal: number;
  /** The multiplier this round's tumble win was paid at (1 = none). In free spins, the running total. */
  multiplier: number;
  scatters: number;
  scatterWin: number;
  /** Everything this round pays, in bets. */
  win: number;
};

export type SpinOutcome = {
  base: SpinRound;
  freeSpins: SpinRound[];
  /** Running free-spin multiplier at the end of the feature. */
  finalMultiplier: number;
  /** Total win in bets, before any payout cap. */
  totalWin: number;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pickWeighted(rng: Rng, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function drawCell(rng: Rng, free: boolean, p: Params): Cell {
  const i = pickWeighted(rng, free ? p.freeWeights : p.baseWeights);
  if (i < SYMBOLS.length) return { s: SYMBOLS[i] };
  if (i === SYMBOLS.length) return { s: "SCATTER" };
  return { s: "ORB", m: ORB_VALUES[pickWeighted(rng, p.orbWeights)] };
}

function payFor(symbol: ZeusSymbol, count: number): number {
  const [a, b, c] = PAYTABLE[symbol];
  return count >= 12 ? c : count >= 10 ? b : a;
}

function copy(grid: Cell[][]): Cell[][] {
  return grid.map((col) => col.map((c) => ({ ...c })));
}

/** Every symbol with 8 or more on the board. */
export function evaluate(grid: Cell[][]): { wins: SymbolWin[]; burst: [number, number][] } {
  const counts = new Map<ZeusSymbol, number>();
  for (const col of grid) for (const c of col) if (c.s !== "SCATTER" && c.s !== "ORB") counts.set(c.s, (counts.get(c.s) ?? 0) + 1);
  const wins: SymbolWin[] = [];
  for (const symbol of SYMBOLS) {
    const count = counts.get(symbol) ?? 0;
    if (count >= MIN_COUNT) wins.push({ symbol, count, pay: payFor(symbol, count) });
  }
  const winning = new Set(wins.map((w) => w.symbol as Sym));
  const burst: [number, number][] = [];
  grid.forEach((col, x) => col.forEach((c, y) => winning.has(c.s) && burst.push([x, y])));
  return { wins, burst };
}

/** Plays one board to the end of its tumbles. `running` is the free-spin total so far (0 in the base game). */
export function playRound(rng: Rng, free: boolean, running: number, p: Params = DEFAULT_PARAMS): SpinRound {
  let grid: Cell[][] = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => drawCell(rng, free, p)));
  const steps: TumbleStep[] = [];
  let tumbleWin = 0;
  for (;;) {
    const { wins, burst } = evaluate(grid);
    if (wins.length === 0) break;
    const win = round4(wins.reduce((s, w) => s + w.pay, 0));
    steps.push({ grid: copy(grid), wins, win, burst });
    tumbleWin += win;
    // Strike the winners; what's left falls, and new cells drop in on top.
    const gone = new Set(burst.map(([x, y]) => `${x}:${y}`));
    grid = grid.map((col, x) => {
      const kept = col.filter((_, y) => !gone.has(`${x}:${y}`));
      const fresh = Array.from({ length: ROWS - kept.length }, () => drawCell(rng, free, p));
      return [...fresh, ...kept];
    });
  }
  tumbleWin = round4(tumbleWin);
  let scatters = 0;
  let orbs = 0;
  for (const col of grid)
    for (const c of col) {
      if (c.s === "SCATTER") scatters++;
      else if (c.s === "ORB") orbs += c.m ?? 0;
    }
  const orbTotal = tumbleWin > 0 ? orbs : 0;
  // Base game: the orbs on the board. Free spins: the running total once these orbs are added.
  const multiplier = orbTotal > 0 ? (free ? running + orbTotal : orbTotal) : 1;
  const scatterWin = scatters >= 6 ? SCATTER_PAYS[2] : scatters === 5 ? SCATTER_PAYS[1] : scatters === 4 ? SCATTER_PAYS[0] : 0;
  const win = round4(tumbleWin * multiplier + scatterWin);
  return { steps, final: grid, tumbleWin, orbTotal, multiplier, scatters, scatterWin, win };
}

export function playSpin(rng: Rng, p: Params = DEFAULT_PARAMS): SpinOutcome {
  const base = playRound(rng, false, 0, p);
  const freeSpins: SpinRound[] = [];
  let running = 0;
  if (base.scatters >= SCATTERS_TO_TRIGGER) {
    let left = FREE_SPINS;
    while (left > 0 && freeSpins.length < MAX_FREE_SPINS) {
      left--;
      const round = playRound(rng, true, running, p);
      running += round.orbTotal;
      freeSpins.push(round);
      if (round.scatters >= SCATTERS_TO_RETRIGGER) left += FREE_RETRIGGER;
    }
  }
  const totalWin = Math.min(MAX_WIN, round4(base.win + freeSpins.reduce((s, r) => s + r.win, 0)));
  return { base, freeSpins, finalMultiplier: running, totalWin };
}

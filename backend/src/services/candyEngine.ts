/**
 * Candy Blast: a 6x5 "pay anywhere" tumbling slot in the style of Sweet
 * Bonanza. Symbols pay when 8 or more of one kind are anywhere on the board
 * (8-9, 10-11 and 12+ pay more). Winning symbols burst, the rest fall down and
 * new ones drop in from the top, and this repeats until nothing wins.
 *
 * Four or more lollipops (scatters) on the board pay and award FREE_SPINS free
 * spins; three or more during free spins add FREE_RETRIGGER more. In free
 * spins, candy bombs can land, each carrying a multiplier; once a spin's
 * tumbles end, if it won, the bombs on the board are added up and multiply
 * that spin's tumble win.
 *
 * Every draw comes from the rng, so a spin replays exactly from its seeds.
 */

export const COLS = 6;
export const ROWS = 5;

// Lowest paying first.
export const SYMBOLS = ["BANANA", "GRAPES", "WATERMELON", "PLUM", "APPLE", "BLUE", "GREEN", "PURPLE", "HEART"] as const;
export type CandySymbol = (typeof SYMBOLS)[number];
export type Sym = CandySymbol | "SCATTER" | "BOMB";
export type Cell = { s: Sym; m?: number };

/** Pays in multiples of the bet for [8-9, 10-11, 12+] of a symbol. */
export const PAYTABLE: Record<CandySymbol, [number, number, number]> = {
  BANANA: [0.25, 0.75, 2],
  GRAPES: [0.4, 0.9, 4],
  WATERMELON: [0.5, 1, 5],
  PLUM: [0.8, 1.2, 8],
  APPLE: [1, 1.5, 10],
  BLUE: [1.5, 2, 12],
  GREEN: [2, 5, 15],
  PURPLE: [2.5, 10, 25],
  HEART: [10, 25, 50],
};
export const MIN_COUNT = 8;
/** Lollipops on the board once the tumbles end: 4, 5, 6+. */
export const SCATTER_PAYS: [number, number, number] = [3, 5, 100];
export const SCATTERS_TO_TRIGGER = 4;
export const SCATTERS_TO_RETRIGGER = 3;
export const FREE_SPINS = 10;
export const FREE_RETRIGGER = 5;
/** Guard so a spin's result stays a bounded size. */
export const MAX_FREE_SPINS = 100;

/** Weight of each symbol (SYMBOLS order), then SCATTER, then BOMB. */
export const BASE_WEIGHTS = [480, 440, 390, 320, 260, 170, 136, 104, 60, 37, 0];
export const FREE_WEIGHTS = [270, 240, 205, 160, 125, 78, 58, 42, 24, 14, 40];
export const BOMB_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100];
export const BOMB_WEIGHTS = [300, 220, 160, 120, 90, 70, 50, 35, 25, 15, 9, 4, 2];

/**
 * Measured over 4.5 million simulated spins: 87.62% ± 0.25% (free spins
 * about 1 in 300 spins, averaging about 67x the bet).
 */
export const MEASURED_RTP = 0.8762;

export type Rng = () => number;

export type Params = { baseWeights: number[]; freeWeights: number[]; bombWeights: number[] };
export const DEFAULT_PARAMS: Params = { baseWeights: BASE_WEIGHTS, freeWeights: FREE_WEIGHTS, bombWeights: BOMB_WEIGHTS };

export type SymbolWin = { symbol: CandySymbol; count: number; pay: number };

export type TumbleStep = {
  /** Board before this step's burst (column by column, top row first). */
  grid: Cell[][];
  wins: SymbolWin[];
  /** Total of this step's wins, in bets. */
  win: number;
  /** [col, row] of every bursting symbol. */
  burst: [number, number][];
};

export type SpinRound = {
  steps: TumbleStep[];
  /** The board once nothing more wins. */
  final: Cell[][];
  /** Sum of the tumble wins, before bombs. */
  tumbleWin: number;
  /** Sum of the bombs on the final board, applied only if the tumbles won (0 = none). */
  bombTotal: number;
  scatters: number;
  scatterWin: number;
  /** Everything this round pays, in bets. */
  win: number;
};

export type SpinOutcome = {
  base: SpinRound;
  freeSpins: SpinRound[];
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
  return { s: "BOMB", m: BOMB_VALUES[pickWeighted(rng, p.bombWeights)] };
}

function payFor(symbol: CandySymbol, count: number): number {
  const [a, b, c] = PAYTABLE[symbol];
  return count >= 12 ? c : count >= 10 ? b : a;
}

function copy(grid: Cell[][]): Cell[][] {
  return grid.map((col) => col.map((c) => ({ ...c })));
}

/** Every symbol with 8 or more on the board. */
export function evaluate(grid: Cell[][]): { wins: SymbolWin[]; burst: [number, number][] } {
  const counts = new Map<CandySymbol, number>();
  for (const col of grid) for (const c of col) if (c.s !== "SCATTER" && c.s !== "BOMB") counts.set(c.s, (counts.get(c.s) ?? 0) + 1);
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

export function playRound(rng: Rng, free: boolean, p: Params = DEFAULT_PARAMS): SpinRound {
  let grid: Cell[][] = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => drawCell(rng, free, p)));
  const steps: TumbleStep[] = [];
  let tumbleWin = 0;
  for (;;) {
    const { wins, burst } = evaluate(grid);
    if (wins.length === 0) break;
    const win = round4(wins.reduce((s, w) => s + w.pay, 0));
    steps.push({ grid: copy(grid), wins, win, burst });
    tumbleWin += win;
    // Burst the winners; what's left falls, and new cells drop in on top.
    const gone = new Set(burst.map(([x, y]) => `${x}:${y}`));
    grid = grid.map((col, x) => {
      const kept = col.filter((_, y) => !gone.has(`${x}:${y}`));
      const fresh = Array.from({ length: ROWS - kept.length }, () => drawCell(rng, free, p));
      return [...fresh, ...kept];
    });
  }
  tumbleWin = round4(tumbleWin);
  let scatters = 0;
  let bombs = 0;
  for (const col of grid)
    for (const c of col) {
      if (c.s === "SCATTER") scatters++;
      else if (c.s === "BOMB") bombs += c.m ?? 0;
    }
  const bombTotal = tumbleWin > 0 ? bombs : 0;
  const scatterWin = scatters >= 6 ? SCATTER_PAYS[2] : scatters === 5 ? SCATTER_PAYS[1] : scatters === 4 ? SCATTER_PAYS[0] : 0;
  const win = round4(tumbleWin * (bombTotal > 0 ? bombTotal : 1) + scatterWin);
  return { steps, final: grid, tumbleWin, bombTotal, scatters, scatterWin, win };
}

export function playSpin(rng: Rng, p: Params = DEFAULT_PARAMS): SpinOutcome {
  const base = playRound(rng, false, p);
  const freeSpins: SpinRound[] = [];
  if (base.scatters >= SCATTERS_TO_TRIGGER) {
    let left = FREE_SPINS;
    while (left > 0 && freeSpins.length < MAX_FREE_SPINS) {
      left--;
      const round = playRound(rng, true, p);
      freeSpins.push(round);
      if (round.scatters >= SCATTERS_TO_RETRIGGER) left += FREE_RETRIGGER;
    }
  }
  const totalWin = round4(base.win + freeSpins.reduce((s, r) => s + r.win, 0));
  return { base, freeSpins, totalWin };
}

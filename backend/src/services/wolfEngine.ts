/**
 * Wolf Moon: a 5x3, 25-line slot in the style of Wolf Gold, with a Hold &
 * Spin "Money Respin" and three jackpots.
 *
 * Lines pay left to right from 3 of a kind. The howling wolf is wild on
 * reels 2-4 and stands in for every paying symbol. A canyon scatter on each
 * of reels 1, 3 and 5 gives 5 free spins, in which reels 2-4 spin as one
 * giant 3x3 symbol.
 *
 * Money Respin: six or more moons in the base game start it. The moons stay,
 * every other square empties, and there are 3 respins; a respin that lands a
 * new moon resets the count to 3. Each moon carries a cash value (in total
 * bets) or the MINI or MAJOR jackpot; filling all 15 squares adds the MEGA
 * jackpot. When the respins run out the moons are paid.
 *
 * Every draw comes from the rng, so a spin replays exactly from its seeds.
 * All pays are in multiples of the total bet.
 */

export const COLS = 5;
export const ROWS = 3;

// Paying symbols, best first.
export const PAYERS = ["BUFFALO", "EAGLE", "COUGAR", "HORSE", "ACE", "KING", "QUEEN", "JACK"] as const;
export type Payer = (typeof PAYERS)[number];
export type Sym = Payer | "WILD" | "SCATTER" | "MOON";
export type Cell = { s: Sym; v?: number; j?: "MINI" | "MAJOR" };

/** Line pays for [3, 4, 5] of a kind, in total bets. */
export const PAYTABLE: Record<Payer, [number, number, number]> = {
  BUFFALO: [2, 8, 40],
  EAGLE: [1.2, 4, 16],
  COUGAR: [0.8, 3.2, 12],
  HORSE: [0.8, 2.4, 8],
  ACE: [0.4, 1.2, 4],
  KING: [0.4, 1.2, 4],
  QUEEN: [0.24, 0.8, 3.2],
  JACK: [0.24, 0.8, 3.2],
};

export const LINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
  [1, 0, 1, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 2, 2, 0],
  [2, 0, 0, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
];

export const FREE_SPINS = 5;
/** Free spins need a scatter on each of these reels. */
export const SCATTER_REELS = [0, 2, 4];
export const MOONS_TO_TRIGGER = 6;
export const RESPINS = 3;
export const JACKPOTS = { MINI: 20, MAJOR: 100, MEGA: 1000 } as const;
/** A whole spin pays at most this many times the bet. */
export const MAX_WIN = 5000;

/**
 * Per-reel weights, in this order: BUFFALO, EAGLE, COUGAR, HORSE, ACE, KING,
 * QUEEN, JACK, WILD, SCATTER, MOON.
 */
export const BASE_REEL_WEIGHTS: number[][] = [
  [20, 26, 30, 34, 44, 44, 50, 50, 0, 20, 42],
  [20, 26, 30, 34, 44, 44, 50, 50, 29, 0, 42],
  [20, 26, 30, 34, 44, 44, 50, 50, 29, 20, 42],
  [20, 26, 30, 34, 44, 44, 50, 50, 29, 0, 42],
  [20, 26, 30, 34, 44, 44, 50, 50, 0, 20, 42],
];
/** Free spins: reels 1 and 5 (no scatter or moon). */
export const FREE_SIDE_WEIGHTS = [22, 28, 32, 36, 44, 44, 50, 50, 0, 0, 0];
/** Free spins: the giant symbol on reels 2-4. */
export const FREE_GIANT_WEIGHTS = [4, 6, 9, 12, 40, 40, 56, 56, 2, 0, 0];

/** Moon cash values in total bets, and their weights. */
export const MOON_VALUES = [1, 2, 3, 4, 5, 8, 10, 15];
export const MOON_WEIGHTS = [300, 240, 160, 110, 80, 45, 30, 15];
/** Chance a moon is a jackpot moon instead of a cash value. */
export const MINI_CHANCE = 0.012;
export const MAJOR_CHANCE = 0.002;
/** Chance an empty square fills with a moon on a respin. */
export const RESPIN_MOON_CHANCE = 0.074;

/**
 * Measured over 40 million simulated spins: 88.07% ± 0.15% (line wins 55.1%;
 * free spins about 1 in 274 spins at 33x; Money Respin about 1 in 230 spins
 * at 48x; a spin wins something 35.7% of the time).
 */
export const MEASURED_RTP = 0.8807;

export type Rng = () => number;

export type Params = {
  baseReelWeights: number[][];
  freeSideWeights: number[];
  freeGiantWeights: number[];
  moonWeights: number[];
  respinMoonChance: number;
};
export const DEFAULT_PARAMS: Params = {
  baseReelWeights: BASE_REEL_WEIGHTS,
  freeSideWeights: FREE_SIDE_WEIGHTS,
  freeGiantWeights: FREE_GIANT_WEIGHTS,
  moonWeights: MOON_WEIGHTS,
  respinMoonChance: RESPIN_MOON_CHANCE,
};

const ORDER: Sym[] = [...PAYERS, "WILD", "SCATTER", "MOON"];

export type LineWin = { line: number; symbol: Payer; count: number; pay: number };

export type Board = {
  /** Column by column, top row first. */
  grid: Cell[][];
  lines: LineWin[];
  lineWin: number;
};

export type RespinStep = {
  /** Squares that filled on this respin: [col, row, cell]. */
  landed: [number, number, Cell][];
  /** Respins left after this one. */
  left: number;
};

export type MoneyRespin = {
  /** The moons the feature started with (null where empty). */
  start: (Cell | null)[][];
  steps: RespinStep[];
  /** Final board (null where empty). */
  final: (Cell | null)[][];
  cash: number;
  minis: number;
  majors: number;
  mega: boolean;
  win: number;
};

export type SpinOutcome = {
  base: Board;
  scatters: number;
  moons: number;
  freeSpins: (Board & { giant: Sym })[];
  respin: MoneyRespin | null;
  /** Total win in total bets, capped at MAX_WIN. */
  totalWin: number;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pick(rng: Rng, weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function drawMoon(rng: Rng, p: Params): Cell {
  const r = rng();
  if (r < MAJOR_CHANCE) return { s: "MOON", j: "MAJOR", v: JACKPOTS.MAJOR };
  if (r < MAJOR_CHANCE + MINI_CHANCE) return { s: "MOON", j: "MINI", v: JACKPOTS.MINI };
  return { s: "MOON", v: MOON_VALUES[pick(rng, p.moonWeights)] };
}

function drawCell(rng: Rng, weights: number[], p: Params): Cell {
  const s = ORDER[pick(rng, weights)];
  return s === "MOON" ? drawMoon(rng, p) : { s };
}

/** Pays every line, left to right from reel 1, 3+ of a kind with wilds standing in. */
export function evaluate(grid: Cell[][]): { lines: LineWin[]; lineWin: number } {
  const lines: LineWin[] = [];
  LINES.forEach((rows, li) => {
    const cells = rows.map((r, c) => grid[c][r].s);
    let symbol: Payer | null = null;
    let count = 0;
    for (const s of cells) {
      if (s === "WILD") {
        count++;
        continue;
      }
      if ((PAYERS as readonly string[]).includes(s)) {
        if (symbol === null) {
          symbol = s as Payer;
          count++;
          continue;
        }
        if (s === symbol) {
          count++;
          continue;
        }
      }
      break;
    }
    // A line of only wilds pays as the top symbol.
    if (symbol === null && count >= 3) symbol = "BUFFALO";
    if (symbol && count >= 3) lines.push({ line: li, symbol, count, pay: PAYTABLE[symbol][count - 3] });
  });
  return { lines, lineWin: round4(lines.reduce((s, l) => s + l.pay, 0)) };
}

function playRespin(rng: Rng, grid: Cell[][], p: Params): MoneyRespin {
  const board: (Cell | null)[][] = grid.map((col) => col.map((c) => (c.s === "MOON" ? { ...c } : null)));
  const start = board.map((col) => col.map((c) => (c ? { ...c } : null)));
  let left = RESPINS;
  const steps: RespinStep[] = [];
  const full = () => board.every((col) => col.every((c) => c !== null));
  while (left > 0 && !full()) {
    const landed: [number, number, Cell][] = [];
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        if (board[c][r]) continue;
        if (rng() < p.respinMoonChance) {
          const m = drawMoon(rng, p);
          board[c][r] = m;
          landed.push([c, r, m]);
        }
      }
    left = landed.length > 0 ? RESPINS : left - 1;
    steps.push({ landed, left });
  }
  let cash = 0;
  let minis = 0;
  let majors = 0;
  for (const col of board)
    for (const c of col) {
      if (!c) continue;
      if (c.j === "MINI") minis++;
      else if (c.j === "MAJOR") majors++;
      else cash += c.v ?? 0;
    }
  const mega = full();
  const win = round4(cash + minis * JACKPOTS.MINI + majors * JACKPOTS.MAJOR + (mega ? JACKPOTS.MEGA : 0));
  return { start, steps, final: board, cash: round4(cash), minis, majors, mega, win };
}

export function playSpin(rng: Rng, p: Params = DEFAULT_PARAMS): SpinOutcome {
  const grid: Cell[][] = Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, () => drawCell(rng, p.baseReelWeights[c], p)));
  const base = { grid, ...evaluate(grid) };
  let scatters = 0;
  let moons = 0;
  for (const col of grid)
    for (const c of col) {
      if (c.s === "SCATTER") scatters++;
      else if (c.s === "MOON") moons++;
    }
  const freeSpins: (Board & { giant: Sym })[] = [];
  if (SCATTER_REELS.every((c) => grid[c].some((cell) => cell.s === "SCATTER"))) {
    for (let i = 0; i < FREE_SPINS; i++) {
      const giant = ORDER[pick(rng, p.freeGiantWeights)];
      const g: Cell[][] = Array.from({ length: COLS }, (_, c) =>
        Array.from({ length: ROWS }, () => (c >= 1 && c <= 3 ? { s: giant } : drawCell(rng, p.freeSideWeights, p)))
      );
      freeSpins.push({ grid: g, giant, ...evaluate(g) });
    }
  }
  const respin = moons >= MOONS_TO_TRIGGER ? playRespin(rng, grid, p) : null;
  const total = base.lineWin + freeSpins.reduce((s, f) => s + f.lineWin, 0) + (respin?.win ?? 0);
  return { base, scatters, moons, freeSpins, respin, totalWin: Math.min(MAX_WIN, round4(total)) };
}

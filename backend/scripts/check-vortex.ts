/**
 * Checks Vortex's maths without a database:
 *
 *   cd backend && npx tsx scripts/check-vortex.ts
 *
 * 1. On every board the chances add up to 1.
 * 2. On every board with something on it a spin is fair: what the elements add on average (a ring's next section, a full ring's bonus,
 *    the Fire bonus's premium) equals what a Skull takes off on average, which is the whole board.
 * 3. A first spin (the one that takes the bet) is worth the return to player.
 * 4. A Skull clears the board, whatever was on it.
 * 5. Rounds played in different ways (cash out early or late, never, with part payouts) return the return to player on average.
 *
 * It prints every check and exits with 1 if one fails.
 */
import { env } from "../src/config/env";
import { ELEMENT_ORDER, MAX_SPINS, RINGS, applySymbol, boardMultiplier, partPayout, spinChances, symbolFor, type Fill } from "../src/services/vortexService";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const rtp = 1 - env.games.crashHouseEdge;
const EMPTY: Fill = { water: 0, earth: 0, fire: 0 };
const levels = ELEMENT_ORDER.map((el) => RINGS[el].ladder.length);

const boards: Fill[] = [];
for (let w = 0; w <= levels[0]; w++) for (let e = 0; e <= levels[1]; e++) for (let f = 0; f <= levels[2]; f++) boards.push({ water: w, earth: e, fire: f });

// ---- 1. the chances add up
{
  let worst = 0;
  let negative = 0;
  for (const b of boards) {
    const c = spinChances(b);
    worst = Math.max(worst, Math.abs(c.WATER + c.EARTH + c.FIRE + c.SKULL + c.WIND - 1));
    if (Object.values(c).some((v) => v < 0)) negative++;
  }
  check(`the chances of all ${boards.length} boards add up to 1 and none is negative`, worst < 1e-12 && negative === 0, `(largest error ${worst.toExponential(1)})`);
}

// ---- 2. every spin on a loaded board is fair
{
  const PREMIUM_ROLLS = [0.1, 0.3, 0.5, 0.7, 0.9]; // one for each of the five premiums
  let worst = 0;
  let loaded = 0;
  for (const b of boards) {
    const board = boardMultiplier(b);
    if (board <= 0) continue;
    loaded++;
    const c = spinChances(b);
    let change = 0; // expected change of (board + cash paid)
    for (const el of ELEMENT_ORDER) {
      const avg = PREMIUM_ROLLS.reduce((sum, r) => {
        const { fill, instant } = applySymbol(b, el, r);
        return sum + boardMultiplier(fill) + instant - board;
      }, 0) / PREMIUM_ROLLS.length;
      change += c[el] * avg;
    }
    const { fill: afterSkull } = applySymbol(b, "SKULL", 0);
    change += c.SKULL * (boardMultiplier(afterSkull) - board);
    worst = Math.max(worst, Math.abs(change));
  }
  check(`a spin on each of the ${loaded} loaded boards is fair (expected change of board + cash = 0)`, worst < 1e-9, `(largest error ${worst.toExponential(1)})`);
}

// ---- 3. the first spin is worth rtp
{
  const c = spinChances(EMPTY);
  const worth = (c.WATER * RINGS.WATER.ladder[0] + c.EARTH * RINGS.EARTH.ladder[0] + c.FIRE * RINGS.FIRE.ladder[0]) / (1 - c.WIND);
  check(`the first spin of a round is worth the return to player (${(rtp * 100).toFixed(1)}%)`, Math.abs(worth - rtp) < 1e-12, `(${(worth * 100).toFixed(4)}%)`);
}

// ---- 4. a Skull clears the board
{
  const notCleared = boards.filter((b) => boardMultiplier(applySymbol(b, "SKULL", 0).fill) !== 0);
  check("a Skull takes everything off the board, whatever was on it", notCleared.length === 0, notCleared.length ? `(${notCleared.length} boards kept something)` : "");
}

// ---- 5. rounds return rtp, however they are played
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Action = "spin" | "cash" | "part";
type Strategy = (fill: Fill, board: number) => Action;

/** One round; returns everything it paid for a bet of 1. */
function playRound(rng: () => number, strategy: Strategy): number {
  let fill: Fill = { ...EMPTY };
  let paid = 0;
  for (let spins = 1; ; spins++) {
    const symbol = symbolFor(rng(), fill);
    const { fill: next, instant } = applySymbol(fill, symbol, rng());
    paid += instant;
    fill = next;
    const board = boardMultiplier(fill);
    if (board === 0 && symbol !== "WIND") return paid; // a Skull, or the Fire bonus that left the board empty
    if (spins >= MAX_SPINS) return paid + board;
    const action = strategy(fill, board);
    if (action === "cash") return paid + board;
    if (action === "part") {
      const part = partPayout(fill);
      if (part) {
        paid += part.multiplier;
        fill = part.fill;
      }
    }
  }
}

const STRATEGIES: [string, Strategy][] = [
  ["cash out at the first section", (_f, b) => (b > 0 ? "cash" : "spin")],
  ["cash out at x5", (_f, b) => (b >= 5 ? "cash" : "spin")],
  ["cash out at x20", (_f, b) => (b >= 20 ? "cash" : "spin")],
  ["cash out at x60", (_f, b) => (b >= 60 ? "cash" : "spin")],
  ["part payout whenever possible, cash out at x10", (_f, b) => (b >= 10 ? "cash" : "part")],
  ["never cash out (play on until the round ends)", () => "spin"],
];

const ROUNDS = Number(process.env.VORTEX_ROUNDS ?? 400000);
for (const [name, strategy] of STRATEGIES) {
  const rng = mulberry32(20261121);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const v = playRound(rng, strategy);
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / ROUNDS;
  const se = Math.sqrt(Math.max(0, sumSq / ROUNDS - mean * mean) / ROUNDS);
  check(`${ROUNDS.toLocaleString("en")} rounds, ${name}: returns ${(mean * 100).toFixed(2)}% (rtp ${(rtp * 100).toFixed(1)}%, +/- ${(4 * se * 100).toFixed(2)}%)`, Math.abs(mean - rtp) <= 4 * se);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);

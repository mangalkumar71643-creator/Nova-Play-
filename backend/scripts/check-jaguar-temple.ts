/**
 * Checks Jaguar Temple's maths without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-jaguar-temple.ts
 *
 * 1. The exact return to player (every stop combination of the base reels and of the free-game reels) is within 0.1% of the
 *    return the other slots keep (89.9%), and the bought bonus is priced so it returns about the same.
 * 2. Simulated spins (the real play code, a good random stream) return the exact figure within four standard errors, and so do
 *    simulated bought bonuses.
 * 3. Every spin adds up: its total is the lines + the sun stones' pay + the free games, the Jaguar Spirit follows its rule
 *    (one more after every winning free game, at most SPIRIT_MAX), and a spin replayed from the same seeds is the same spin.
 * 4. The reels are what the rules say: the same length on the three reels, no sun stones and no wild on a base reel other than
 *    the third, no sun stones in the free games, wilds only of the three sizes.
 *
 * It prints every check and exits with 1 if one fails.
 */
import { env } from "../src/config/env";
import {
  BUY_PRICE,
  FREE_GAMES,
  FREE_STRIPS,
  LINES,
  SCATTER_PAY,
  SPIRIT_MAX,
  STRIPS,
  SYMBOLS,
  WILD_VALUE,
  evaluateWindow,
  getStats,
  jaguarRng,
  playSpin,
  replayJaguarSpin,
  windowFor,
} from "../src/services/jaguarTempleService";
import { generateClientSeed, generateServerSeed } from "../src/utils/rng";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const SC = SYMBOLS.indexOf("SUN");
const stats = getStats();
void env;

// ---- 4. the reels
{
  check("the three base reels are the same length, and so are the three free-game reels", new Set(STRIPS.map((s) => s.length)).size === 1 && new Set(FREE_STRIPS.map((s) => s.length)).size === 1, `(${STRIPS[0].length} and ${FREE_STRIPS[0].length} stops)`);
  const wildIdx = Object.keys(WILD_VALUE).map(Number);
  check("base game: wilds only on the third reel", STRIPS.every((s, r) => r === 2 || s.every((x) => !wildIdx.includes(x))) && STRIPS[2].some((x) => wildIdx.includes(x)));
  check("every reel has sun stones in the base game, none in the free games", STRIPS.every((s) => s.includes(SC)) && FREE_STRIPS.every((s) => !s.includes(SC)));
  check("every free-game reel has a wild", FREE_STRIPS.every((s) => s.some((x) => wildIdx.includes(x))));
  check("a sun stone is never next to another one (a reel shows at most one)", STRIPS.every((s) => s.every((x, i) => x !== SC || (s[(i + 1) % s.length] !== SC && s[(i + s.length - 1) % s.length] !== SC))));
  check("five lines: three rows and two diagonals", LINES.length === 5);
}

// ---- 1. exact return
{
  console.log(`     exact: lines ${(stats.baseRtp * 100).toFixed(2)}% (with sun pay), hit ${(stats.hitRate * 100).toFixed(1)}%, bonus 1 in ${(1 / stats.featureChance).toFixed(1)}, a bonus averages ${(stats.featureAverage + SCATTER_PAY).toFixed(1)}x, free game ${stats.freeMean.toFixed(3)}x (hits ${(stats.freeHitRate * 100).toFixed(1)}%)`);
  check(`exact return to player is ${(stats.rtp * 100).toFixed(3)}% (target 89.9%, +/- 0.1%)`, Math.abs(stats.rtp - 0.899) <= 0.001);
  check(`the bought bonus (${BUY_PRICE}x) returns ${(stats.buyRtp * 100).toFixed(3)}% (within 0.3% of the game)`, Math.abs(stats.buyRtp - stats.rtp) <= 0.003);
  check("a spin hits (any line) about one time in three or four", stats.hitRate > 0.22 && stats.hitRate < 0.35);
}

// ---- 3. every spin adds up
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  const rng = mulberry32(20261121);
  let badTotal = 0;
  let badSpirit = 0;
  let badLines = 0;
  let features = 0;
  const maxFree = { v: 0 };
  for (let i = 0; i < 300000; i++) {
    const o = playSpin(rng);
    const sum = o.lineWin + o.scatterWin + o.freeGames.reduce((s, f) => s + f.win, 0);
    if (Math.abs(sum - o.totalWin) > 1e-3) badTotal++;
    if (o.feature) {
      features++;
      if (o.freeGames.length !== FREE_GAMES) badSpirit++;
      let spirit = 1;
      for (const g of o.freeGames) {
        if (g.spirit !== spirit || Math.abs(g.win - g.lineWin * spirit) > 1e-9) badSpirit++;
        if (g.lineWin > 0) spirit = Math.min(SPIRIT_MAX, spirit + 1);
        const re = evaluateWindow(windowFor(FREE_STRIPS, g.stops));
        if (Math.abs(re.total - g.lineWin) > 1e-9) badLines++;
      }
    } else if (o.freeGames.length || o.scatterWin) badSpirit++;
    const re = evaluateWindow(windowFor(STRIPS, o.stops));
    if (!o.bought && (Math.abs(re.total - o.lineWin) > 1e-9 || re.lines.length !== o.lines.length)) badLines++;
    maxFree.v = Math.max(maxFree.v, o.totalWin);
  }
  check("every spin's total is its lines + sun pay + free games", badTotal === 0, `(${badTotal} wrong of 300,000)`);
  check(`the free games are ${FREE_GAMES} and the Jaguar Spirit grows by one after each winning game (at most x${SPIRIT_MAX})`, badSpirit === 0 && features > 1000, `(${features} bonuses seen)`);
  check("the lines of every spin match its stops when the win is counted again", badLines === 0);
  console.log(`     the biggest of 300,000 spins paid ${maxFree.v.toFixed(1)}x`);
}
{
  const a = generateServerSeed();
  const b = generateClientSeed();
  let same = true;
  for (let n = 0; n < 2000; n++) {
    const x = replayJaguarSpin(a, b, n);
    const y = playSpin(jaguarRng(a, b, n));
    if (JSON.stringify(x) !== JSON.stringify(y)) same = false;
  }
  const other = replayJaguarSpin(a, b, 7);
  const bought = replayJaguarSpin(a, b, 7, true);
  check("a spin replayed from its seeds and nonce is the same spin", same);
  check("a bought bonus always shows a sun stone on every reel and runs the free games", bought.feature && bought.bought && bought.freeGames.length === FREE_GAMES && evaluateWindow(windowFor(STRIPS, bought.stops)).sunReels === 3 && other.bought === false);
}

// ---- 2. simulated spins return the exact figure
function simulate(name: string, rounds: number, play: (rng: () => number) => number, cost: number, expected: number) {
  const rng = mulberry32(777);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < rounds; i++) {
    const v = play(rng) / cost;
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / rounds;
  const se = Math.sqrt(Math.max(0, sumSq / rounds - mean * mean) / rounds);
  check(`${rounds.toLocaleString("en")} ${name}: returns ${(mean * 100).toFixed(2)}% (exact ${(expected * 100).toFixed(2)}%, +/- ${(4 * se * 100).toFixed(2)}%)`, Math.abs(mean - expected) <= 4 * se);
}
simulate("spins", Number(process.env.JAGUAR_ROUNDS ?? 6_000_000), (rng) => playSpin(rng).totalWin, 1, stats.rtp);
simulate("bought bonuses", Number(process.env.JAGUAR_BUYS ?? 400_000), (rng) => playSpin(rng, true).totalWin, BUY_PRICE, stats.buyRtp);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);

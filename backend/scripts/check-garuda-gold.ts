/**
 * Checks Garuda Gold's maths without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-garuda-gold.ts
 *
 * 1. The reels are what the rules say: three reels of 43-44 stops with the symbols of the paytable (reel 1 has a stack of
 *    three WILDs), the multiplier reels hold their counts (1000 stops; EX has no 1x), the nudge tables add up to 10,000,
 *    and the paytable is the one on the screen.
 * 2. The exact return to player, counted over every stop combination of reels 1-3, every stop of the multiplier reel and
 *    every place of the nudge table, through the play code itself (outcomeFor), is 90% within 0.01% in both modes, and
 *    the closed-form figure the game reports is the same number.
 * 3. Simulated spins (the real play code and its random stream) return the exact figure within four standard errors.
 * 4. Every spin adds up: the win is the line wins times the multiplier, the centre coin is the one in the middle of the
 *    five in sight, a nudge only follows a NUDGE coin on a winning spin, and a spin replayed from the same seeds is the same spin.
 *
 * It prints every check and exits with 1 if one fails.
 */
import {
  COIN_COUNTS,
  COIN_STRIPS,
  COIN_VALUE,
  COINS,
  EX_COST,
  LINES,
  NUDGE_WEIGHTS,
  PAYS,
  STRIPS,
  SYMBOLS,
  evaluateWindow,
  getStats,
  outcomeFor,
  replayGarudaSpin,
  windowFor,
} from "../src/services/garudaGoldEngine";
import { generateClientSeed, generateServerSeed } from "../src/utils/rng";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const stats = getStats();
const sym = (name: string) => SYMBOLS.indexOf(name as (typeof SYMBOLS)[number]);
const MODES = ["normal", "ex"] as const;

// ---- 1. the reels and the paytable
{
  check("three reels of 43 to 44 stops", STRIPS.length === 3 && STRIPS.every((s) => s.length >= 43 && s.length <= 44), `(${STRIPS.map((s) => s.length).join(", ")})`);
  check("every reel holds every symbol", STRIPS.every((s) => SYMBOLS.every((_, i) => s.includes(i))));
  const w = sym("WILD");
  check("reel 1 has a stack of three WILDs", STRIPS[0].some((x, i) => x === w && STRIPS[0][(i + 1) % STRIPS[0].length] === w && STRIPS[0][(i + 2) % STRIPS[0].length] === w));
  check(
    "the paytable: 3 WILDs = 25, ruby = 10, sapphire = 5, emerald = 3, A = 1, K = 0.8, Q = 0.5, J = 0.3 (stakes per line)",
    PAYS.WILD === 25 && PAYS.RUBY === 10 && PAYS.SAPPHIRE === 5 && PAYS.EMERALD === 3 && PAYS.A === 1 && PAYS.K === 0.8 && PAYS.Q === 0.5 && PAYS.J === 0.3
  );
  check("five lines: the three rows and the two diagonals", LINES.length === 5 && JSON.stringify(LINES) === JSON.stringify([[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]]));
  for (const mode of MODES) {
    const strip = COIN_STRIPS[mode];
    const counts = COIN_COUNTS[mode];
    check(`${mode}: the multiplier reel has 1000 stops and holds every coin as often as its count says`, strip.length === 1000 && Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) === 1000 && COINS.every((c) => strip.filter((x) => x === c).length === (counts[c] ?? 0)));
    check(`${mode}: no 500x on the reel itself (500x only comes from a nudge)`, !strip.includes("X500"));
    const weights = Object.values(NUDGE_WEIGHTS[mode]).reduce((a, b) => a + (b ?? 0), 0);
    check(`${mode}: the nudge table adds up to 10,000 and only holds 10x to 500x`, weights === 10000 && Object.keys(NUDGE_WEIGHTS[mode]).every((c) => COIN_VALUE[c as keyof typeof COIN_VALUE] >= 10));
    check(`${mode}: two NUDGE coins are never next to each other`, strip.every((c, i) => c !== "NUDGE" || strip[(i + 1) % strip.length] !== "NUDGE"));
  }
  check("EX: no 1x coin, and EX costs 1.5 stakes", !COIN_STRIPS.ex.includes("X1") && EX_COST === 1.5);
}

// ---- 2. the exact return, through the play code
{
  // Every stop combination of reels 1 to 3, grouped by what its lines pay (each group keeps one combination to replay).
  const groups = new Map<number, { count: number; stops: number[] }>();
  let combos = 0;
  let hits = 0;
  for (let a = 0; a < STRIPS[0].length; a++)
    for (let b = 0; b < STRIPS[1].length; b++)
      for (let c = 0; c < STRIPS[2].length; c++) {
        const { linePay } = evaluateWindow(windowFor(STRIPS, [a, b, c]));
        const g = groups.get(linePay);
        if (g) g.count++;
        else groups.set(linePay, { count: 1, stops: [a, b, c] });
        combos++;
        if (linePay > 0) hits++;
      }
  check(`the hit rate the game reports is the counted one (${((hits / combos) * 100).toFixed(2)}% of ${combos.toLocaleString()} combinations)`, Math.abs(hits / combos - stats.hitRate) < 1e-12);

  for (const mode of MODES) {
    const ex = mode === "ex";
    const table = Object.entries(NUDGE_WEIGHTS[mode]) as [string, number][];
    // A roll in the middle of each band of the nudge table lands on that band's coin.
    const rolls: { roll: number; p: number }[] = [];
    let acc = 0;
    for (const [, wgt] of table) {
      rolls.push({ roll: (acc + wgt / 2) / 10000, p: wgt / 10000 });
      acc += wgt;
    }
    let ev = 0;
    for (const [pay, g] of groups) {
      void pay;
      for (let stop = 0; stop < 1000; stop++) {
        const coin = COIN_STRIPS[mode][stop];
        if (coin === "NUDGE") {
          for (const r of rolls) ev += (g.count / combos) * (1 / 1000) * r.p * outcomeFor(g.stops, stop, r.roll, ex).totalWin;
        } else {
          ev += (g.count / combos) * (1 / 1000) * outcomeFor(g.stops, stop, 0.5, ex).totalWin;
        }
      }
    }
    const rtp = ev / (ex ? EX_COST : 1);
    const reported = ex ? stats.exRtp : stats.rtp;
    check(`${mode}: the return counted through the play code is 90% within 0.01% (${(rtp * 100).toFixed(5)}%)`, Math.abs(rtp - 0.9) < 0.0001);
    check(`${mode}: and it is the figure the game reports (${(reported * 100).toFixed(5)}%)`, Math.abs(rtp - reported) < 1e-9);
  }
}

// ---- 3. simulated spins
{
  const N = 600_000;
  for (const mode of MODES) {
    const ex = mode === "ex";
    let sum = 0;
    let sq = 0;
    let nudges = 0;
    for (let i = 0; i < N; i++) {
      const o = replayGarudaSpin(generateServerSeed(), generateClientSeed(), i, ex);
      const r = o.totalWin / (ex ? EX_COST : 1);
      sum += r;
      sq += r * r;
      if (o.nudge) nudges++;
    }
    const mean = sum / N;
    const sd = Math.sqrt(Math.max(0, sq / N - mean * mean));
    const se = sd / Math.sqrt(N);
    const exact = ex ? stats.exRtp : stats.rtp;
    check(`${mode}: ${N.toLocaleString()} simulated spins return ${(mean * 100).toFixed(2)}% (exact ${(exact * 100).toFixed(2)}%, within four standard errors of ${(se * 100).toFixed(2)}%)`, Math.abs(mean - exact) <= 4 * se, `(${nudges} nudges)`);
  }
}

// ---- 4. every spin adds up
{
  let ok = true;
  let nudgeOk = true;
  let windowOk = true;
  for (let i = 0; i < 50_000; i++) {
    const ex = i % 2 === 1;
    const o = replayGarudaSpin(generateServerSeed(), generateClientSeed(), i, ex);
    const value = o.nudge ? COIN_VALUE[o.nudge as keyof typeof COIN_VALUE] : o.coin === "NUDGE" ? 1 : COIN_VALUE[o.coin as keyof typeof COIN_VALUE];
    const mult = o.linePay > 0 ? value : 1;
    if (Math.abs(o.totalWin - Math.round(o.linePay * mult * 10000) / 10000) > 1e-9 || o.multiplier !== mult) ok = false;
    if (o.linePay !== Math.round(o.lines.reduce((s, l) => s + l.pay, 0) * 10000) / 10000) ok = false;
    if (o.nudge && (o.coin !== "NUDGE" || o.linePay <= 0)) nudgeOk = false;
    if (o.coin === "NUDGE" && o.linePay > 0 && !o.nudge) nudgeOk = false;
    if (o.coinWindow[2] !== o.coin || o.coinWindow.length !== 5) windowOk = false;
    const win = windowFor(STRIPS, o.stops).map((col) => col.map((s) => SYMBOLS[s]));
    if (JSON.stringify(win) !== JSON.stringify(o.window)) windowOk = false;
  }
  check("every spin's win is its line wins times its multiplier (1 when nothing won)", ok);
  check("a nudge comes only from a NUDGE coin on a winning spin, and always does", nudgeOk);
  check("the reels and the five coins in sight are the strips at the spin's stops, the centre coin in the middle", windowOk);
  const s1 = generateServerSeed();
  const c1 = generateClientSeed();
  check("a spin replayed from the same seeds is the same spin", JSON.stringify(replayGarudaSpin(s1, c1, 9, true)) === JSON.stringify(replayGarudaSpin(s1, c1, 9, true)));
  const w = sym("WILD");
  const allWild = evaluateWindow([[w, w, w], [w, w, w], [w, w, w]]);
  check("three WILDs on a line pay 25, a full screen of WILDs pays all five lines (125)", allWild.linePay === 125 && allWild.lines.length === 5);
  const mixed = evaluateWindow([[w, sym("RUBY"), sym("J")], [sym("RUBY"), sym("RUBY"), sym("Q")], [sym("RUBY"), sym("K"), w]]);
  check("a WILD completes a line of the symbol beside it (WILD RUBY RUBY on the top row pays 10)", mixed.lines.some((l) => l.line === 0 && l.symbol === "RUBY" && l.pay === 10));
  console.log(`     max line win of one spin ${stats.maxLinePay} stakes, so the most a spin can win is ${stats.maxLinePay * 500} stakes (with a 500x nudge)`);
}

console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);

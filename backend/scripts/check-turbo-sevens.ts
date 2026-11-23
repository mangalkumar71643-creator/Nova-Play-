/**
 * Checks Turbo Sevens's maths without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-turbo-sevens.ts
 *
 * 1. The reels are what the rules say: three main reels of the same length with the same symbols, one flaming 7 on each, the
 *    bonus reel's stops add up to its length, and the paytable is the one on the screen.
 * 2. The exact return to player, counted over every stop combination of the four reels (and the wheel's weights for the respins),
 *    is 90% within 0.01%, and the closed-form figure the game reports is the same number.
 * 3. Simulated spins (the real play code, a good random stream) return the exact figure within four standard errors.
 * 4. Every spin adds up: the win is the payline times the multiplier plus the cash symbol, respins only follow a RESPIN stop,
 *    a respin never starts respins, and a spin replayed from the same seeds is the same spin.
 *
 * It prints every check and exits with 1 if one fails.
 */
import { env } from "../src/config/env";
import {
  ANY7_PAY,
  ANY_BAR_PAY,
  ANY_PAY,
  BONUS_COUNTS,
  BONUS_STRIP,
  BONUS_SYMBOLS,
  CASH_PAY,
  MAX_RESPINS,
  MULTIPLIERS,
  PAYS,
  STRIPS,
  SYMBOLS,
  WHEEL,
  evaluateLine,
  getStats,
  playSpin,
  replayTurboSpin,
  stepFor,
  turboRng,
  wheelRespins,
} from "../src/services/turboSevensEngine";
import { generateClientSeed, generateServerSeed } from "../src/utils/rng";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const stats = getStats();
void env;
const idx = (name: string) => SYMBOLS.indexOf(name as (typeof SYMBOLS)[number]);

// ---- 1. the reels and the paytable
{
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y).join(",");
  check("the three main reels are the same length and hold the same symbols (in different orders)", new Set(STRIPS.map((s) => s.length)).size === 1 && new Set(STRIPS.map((s) => sorted(s))).size === 1, `(${STRIPS[0].length} stops)`);
  check("each main reel has exactly one flaming 7 and the flaming 7 is never next to another 7", STRIPS.every((s) => s.filter((x) => x === idx("FLAME7")).length === 1 && s.every((x, i) => ![idx("FLAME7"), idx("RED7"), idx("GOLD7")].includes(x) || ![idx("FLAME7"), idx("RED7"), idx("GOLD7")].includes(s[(i + 1) % s.length]))));
  check("the bonus reel's stops add up to its length, 200", Object.values(BONUS_COUNTS).reduce((a, b) => a + b, 0) === 200 && BONUS_STRIP.length === 200);
  check("the bonus reel holds every symbol as often as its count says", BONUS_SYMBOLS.every((s) => BONUS_STRIP.filter((x) => x === s).length === BONUS_COUNTS[s]));
  check("no two $$+ or x10 stops are next to each other on the bonus reel", BONUS_STRIP.every((s, i) => !["CASH20", "X10"].includes(s) || BONUS_STRIP[(i + 1) % 200] !== s));
  check("the paytable: flaming 777 = 200, red 777 = 40, 777 = 20, green double BAR = 8, blue BAR = 4, any 7s = 8, any BARs = 2, any = 0.8", PAYS[idx("FLAME7")] === 200 && PAYS[idx("RED7")] === 40 && PAYS[idx("GOLD7")] === 20 && PAYS[idx("GREEN2BAR")] === 8 && PAYS[idx("BLUE1BAR")] === 4 && ANY7_PAY === 8 && ANY_BAR_PAY === 2 && ANY_PAY === 0.8);
  check("the bonus reel: x2, x5, x10 and $+ = 2, $$+ = 20, the wheel awards 1 to 5 respins", MULTIPLIERS.X2 === 2 && MULTIPLIERS.X5 === 5 && MULTIPLIERS.X10 === 10 && CASH_PAY.CASH2 === 2 && CASH_PAY.CASH20 === 20 && WHEEL.length === 5 && WHEEL[0].respins === 1 && WHEEL[4].respins === MAX_RESPINS && WHEEL.reduce((s, w) => s + w.weight, 0) === 100);
  const F = idx("FLAME7"), R = idx("RED7"), G = idx("GOLD7"), GB = idx("GREEN2BAR"), BB = idx("BLUE1BAR"), BL = idx("BLANK");
  const ev = (c: number[]) => evaluateLine(c);
  check("lines: three of a kind pays its price", ev([F, F, F]).pay === 200 && ev([R, R, R]).pay === 40 && ev([G, G, G]).pay === 20 && ev([GB, GB, GB]).pay === 8 && ev([BB, BB, BB]).pay === 4);
  check("lines: any mix of 7s = 8, any mix of BARs = 2, any 7 and BAR mix = 0.8, a blank pays nothing", ev([F, R, G]).pay === 8 && ev([G, G, F]).pay === 8 && ev([GB, BB, GB]).pay === 2 && ev([BB, BB, GB]).pay === 2 && ev([F, GB, BB]).pay === 0.8 && ev([G, G, BB]).pay === 0.8 && ev([F, F, BL]).pay === 0 && ev([BL, BL, BL]).pay === 0);
}

// ---- 2. exact return
{
  // Every combination of the four reels: 24^3 x 200 = 2.76 million, with the multiplier and cash symbols applied by the real step code.
  let sum = 0;
  let paying = 0;
  let total = 0;
  let maxSpin = 0;
  const n = BONUS_STRIP.length;
  for (let a = 0; a < STRIPS[0].length; a++) {
    for (let b = 0; b < STRIPS[1].length; b++) {
      for (let c = 0; c < STRIPS[2].length; c++) {
        for (let d = 0; d < n; d++) {
          const step = stepFor([a, b, c], d, false);
          sum += step.win;
          total++;
          if (step.win > 0) paying++;
          if (step.win > maxSpin) maxSpin = step.win;
        }
      }
    }
  }
  const spinEv = sum / total;
  // A respin is worth the paid spin's own expectation; the RESPIN stop (6 of 200) awards on average this many respins.
  const respinsMean = WHEEL.reduce((s, w) => s + (w.respins * w.weight) / 100, 0);
  const exactRtp = spinEv * (1 + (BONUS_STRIP.filter((s) => s === "RESPIN").length / n) * respinsMean);
  console.log(`     exact: one spin ${(spinEv * 100).toFixed(3)}% of the stake, respins ${(100 * (exactRtp - spinEv)).toFixed(3)}%, total ${(exactRtp * 100).toFixed(4)}%; pays on ${(100 * paying / total).toFixed(1)}% of the spins; payline only ${(stats.lineEv * 100).toFixed(2)}% (hit ${(stats.lineHit * 100).toFixed(1)}%); a spin can win up to ${maxSpin}x, with respins ${maxSpin * (1 + MAX_RESPINS)}x`);
  check("the exact return of the game is 90% (within 0.01%)", Math.abs(exactRtp - 0.9) < 0.0001, `(${(exactRtp * 100).toFixed(4)}%)`);
  check("the figures the game reports (closed form) are the same numbers as the full count", Math.abs(stats.spinEv - spinEv) < 1e-9 && Math.abs(stats.rtp - exactRtp) < 1e-9 && Math.abs(stats.hitRate - paying / total) < 1e-9);
  check("the line kinds' counts add up to every combination", Object.values(stats.lineCounts).reduce((a, b) => a + b, 0) === stats.combos && stats.combos === 24 * 24 * 24);
}

// ---- 3. simulated spins with real draws
{
  const N = 1_500_000;
  let sum = 0;
  let sq = 0;
  let hits = 0;
  let respinSpins = 0;
  let respinCount = 0;
  for (let i = 0; i < N; i++) {
    const out = playSpin(turboRng(generateServerSeed(), generateClientSeed(), i));
    sum += out.totalWin;
    sq += out.totalWin * out.totalWin;
    if (out.spins[0].win > 0) hits++;
    if (out.respins > 0) {
      respinSpins++;
      respinCount += out.respins;
    }
  }
  const mean = sum / N;
  const se = Math.sqrt(Math.max(0, sq / N - mean * mean) / N);
  check(`${N.toLocaleString()} simulated spins return the exact ${(stats.rtp * 100).toFixed(2)}% (within four standard errors)`, Math.abs(mean - stats.rtp) <= 4 * se, `(${(mean * 100).toFixed(2)}% +/- ${(se * 100).toFixed(2)})`);
  check("the first spin pays as often as the count says", Math.abs(hits / N - stats.hitRate) < 0.003, `(${((hits / N) * 100).toFixed(2)}% vs ${(stats.hitRate * 100).toFixed(2)}%)`);
  check("the RESPIN stop comes as often as the count says and the wheel awards what its weights say", Math.abs(respinSpins / N - stats.respinChance) < 0.0015 && Math.abs(respinCount / Math.max(1, respinSpins) - stats.respinsMean) < 0.05, `(1 in ${(N / respinSpins).toFixed(1)}, ${(respinCount / Math.max(1, respinSpins)).toFixed(2)} respins)`);
}

// ---- 4. every spin adds up
{
  let bad = 0;
  let respinsSeen = 0;
  for (let i = 0; i < 200_000; i++) {
    const seed = generateServerSeed();
    const client = generateClientSeed();
    const out = playSpin(turboRng(seed, client, i));
    const [first, ...rest] = out.spins;
    let fine = out.spins.length === 1 + out.respins && rest.length === out.respins;
    fine = fine && (out.respins === 0) === (first.bonus !== "RESPIN");
    fine = fine && rest.every((s) => s.bonus !== "RESPIN");
    fine = fine && out.respins <= MAX_RESPINS;
    for (const s of out.spins) {
      const expectMult = s.linePay > 0 && MULTIPLIERS[s.bonus] ? MULTIPLIERS[s.bonus] : 1;
      fine = fine && s.multiplier === expectMult && s.cash === (CASH_PAY[s.bonus] ?? 0) && Math.abs(s.win - (s.linePay * s.multiplier + s.cash)) < 1e-9;
      fine = fine && s.window.length === 3 && s.window.every((col) => col.length === 3) && s.bonusWindow.length === 3 && s.bonusWindow[1] === s.bonus;
      fine = fine && evaluateLine(s.window.map((col) => idx(col[1]))).pay === s.linePay;
    }
    fine = fine && Math.abs(out.totalWin - out.spins.reduce((a, s) => a + s.win, 0)) < 1e-6;
    if (out.respins > 0) respinsSeen++;
    if (!fine) bad++;
  }
  check("every simulated spin adds up (wins, multipliers, cash symbols, respins) and respins follow only a RESPIN stop", bad === 0 && respinsSeen > 1000, `(${bad} bad, ${respinsSeen} with respins)`);
  const seed = generateServerSeed();
  const client = generateClientSeed();
  check("a spin replayed from the same seeds is the same spin", JSON.stringify(replayTurboSpin(seed, client, 5)) === JSON.stringify(replayTurboSpin(seed, client, 5)) && JSON.stringify(replayTurboSpin(seed, client, 5)) !== JSON.stringify(replayTurboSpin(seed, client, 6)));
  check("the wheel awards by its weights", [0, 0.34999, 0.35, 0.64999, 0.65, 0.84999, 0.85, 0.94999, 0.95, 0.99999].map(wheelRespins).join() === "1,1,2,2,3,3,4,4,5,5");
}

console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);

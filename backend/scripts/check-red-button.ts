/**
 * Checks Red Button's maths without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-red-button.ts
 *
 * 1. Every switch's chance x its multiplier is exactly the return to player (and no chance is above 1).
 * 2. Draws taken from random seeds (the real HMAC construction) return the return to player on every switch, within four standard errors.
 * 3. What a win pays is the stake x the multiplier rounded down to the paisa, never more.
 * 4. The most a switch lets you bet pays out no more than the max payout.
 *
 * It prints every check and exits with 1 if one fails.
 */
import { env } from "../src/config/env";
import { SWITCHES, drawFor, isWin, maxStakeFor, winChance } from "../src/services/redButtonService";
import { generateClientSeed, generateServerSeed } from "../src/utils/rng";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const rtp = env.games.rtp;

// ---- 1. exact return of every switch
for (const m of SWITCHES) {
  const p = winChance(m);
  check(`x${m}: chance ${(p * 100).toFixed(4)}% x ${m} = ${(p * m * 100).toFixed(4)}% (rtp ${(rtp * 100).toFixed(1)}%)`, Math.abs(p * m - rtp) < 1e-12 && p > 0 && p <= 1);
}
check("the switches rise from smallest to biggest", SWITCHES.every((m, i) => i === 0 || m > SWITCHES[i - 1]));

// ---- 2. draws from random seeds return rtp on every switch
{
  const ROUNDS = Number(process.env.RED_BUTTON_ROUNDS ?? 1_500_000);
  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const sums = SWITCHES.map(() => 0);
  const wins = SWITCHES.map(() => 0);
  let low = 1;
  let high = 0;
  for (let nonce = 0; nonce < ROUNDS; nonce++) {
    const d = drawFor(serverSeed, clientSeed, nonce);
    low = Math.min(low, d);
    high = Math.max(high, d);
    SWITCHES.forEach((m, i) => {
      if (isWin(d, m)) {
        sums[i] += m;
        wins[i]++;
      }
    });
  }
  check("every draw is in [0, 1)", low >= 0 && high < 1, `(lowest ${low.toExponential(2)}, highest ${high.toFixed(8)})`);
  SWITCHES.forEach((m, i) => {
    const mean = sums[i] / ROUNDS;
    const se = Math.sqrt(Math.max(0, m * mean - mean * mean) / ROUNDS);
    check(`${ROUNDS.toLocaleString("en")} pushes on x${m}: ${wins[i].toLocaleString("en")} wins, returns ${(mean * 100).toFixed(2)}% (rtp ${(rtp * 100).toFixed(1)}%, +/- ${(4 * se * 100).toFixed(2)}%)`, Math.abs(mean - rtp) <= 4 * se);
  });
}

// ---- 3. a win pays the stake x the multiplier rounded down
{
  const floor2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
  let bad = 0;
  for (const m of SWITCHES) {
    for (const stake of [1, 1.5, 2.25, 7.77, 10, 33.33, 99.99, 250, 1234.56, 99999.99]) {
      const pays = floor2(stake * m);
      if (pays > stake * m + 1e-9 || pays < stake * m - 0.0100001) bad++;
    }
  }
  check("a win pays stake x multiplier rounded down to the paisa, never more", bad === 0);
}

// ---- 4. the bet limit of every switch
for (const m of SWITCHES) {
  const top = maxStakeFor(m);
  const ok = top * m <= env.games.maxPayout + 1e-9 && top <= env.games.maxStake;
  check(`x${m}: the highest bet (${top.toLocaleString("en")}) can win at most the max payout`, ok);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);

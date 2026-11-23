/**
 * Checks Ring Gauntlet's maths without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-ring-gauntlet.ts
 *
 * 1. The rings are what the game shows: 8, 6 and 4 segments, the labels and multipliers of the screen, climbing in value,
 *    with a bonus on the last segment of each ring.
 * 2. The return is exact: for every ring and every segment, multiplier x chance of getting there = the return to player
 *    (so stopping anywhere, on any ring, returns the same), the outer ring's bonus wheel included, and a part cash-out
 *    (half now, half later) returns it too.
 * 3. Simulated rounds (the real play code, the provably fair draws of random seeds) return the exact figure for every
 *    stopping segment within four standard errors.
 * 4. A round replayed from the same seeds is the same round, and the bonus wheel follows its weights.
 *
 * It prints every check and exits with 1 if one fails.
 */
import { env } from "../src/config/env";
import { MAX_PART_CASHOUTS, RING_KEYS, RingKey, multiplierAfter, playRing, ringShape, ringSteps, ringTable, wheelAdd, wheelSegments } from "../src/services/ringGauntletEngine";
import { fairRandomFloat, generateClientSeed, generateServerSeed } from "../src/utils/rng";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const rtp = env.games.rtp;
const LABELS: Record<RingKey, string[]> = {
  OUTER: ["3.9X", "12.5X", "28X", "52X", "85X", "133X", "200X", "BONUS"],
  MIDDLE: ["2.5X", "7.7X", "16X", "27.5X", "44X", "+20.5X"],
  INNER: ["1.55X", "4.85X", "10X", "+7X"],
};

// ---- 1. the rings
for (const ring of RING_KEYS) {
  const table = ringTable(ring, rtp);
  check(`${ring}: ${LABELS[ring].length} segments, labelled ${LABELS[ring].join(" ")}`, table.length === LABELS[ring].length && table.every((s, i) => s.label === LABELS[ring][i]) && ringSteps(ring) === table.length);
  check(`${ring}: the multipliers climb, the last segment is a bonus`, table.every((s, i) => i === 0 || s.multiplier > table[i - 1].multiplier) && table[table.length - 1].kind !== "x");
  check(`${ring}: every chance is a real chance (0 to 1) and the chance of getting there only falls`, table.every((s, i) => s.survive > 0 && s.survive <= 1 && s.reach > 0 && (i === 0 || s.reach < table[i - 1].reach)));
}
check("the badges: outer square, middle triangle, inner circle", ringShape("OUTER") === "SQUARE" && ringShape("MIDDLE") === "TRIANGLE" && ringShape("INNER") === "CIRCLE");
check("the plus segments add to the multiplier before them: 44 + 20.5 = 64.5 and 10 + 7 = 17", multiplierAfter("MIDDLE", 6, 20.5) === 64.5 && multiplierAfter("INNER", 4, 7) === 17);

// ---- 2. exact return
{
  let worst = 0;
  for (const ring of RING_KEYS) {
    const table = ringTable(ring, rtp);
    let chance = 1;
    for (const seg of table) {
      chance *= seg.survive; // the product of the chances of every segment so far
      worst = Math.max(worst, Math.abs(chance * seg.multiplier - rtp));
    }
    console.log(`     ${ring}: ${table.map((s) => `${s.label} ${(s.reach * 100).toFixed(4)}%`).join(", ")}`);
  }
  check(`stopping on any segment of any ring returns exactly ${(rtp * 100).toFixed(2)}% of the stake (largest error ${worst.toExponential(1)})`, worst < 1e-12);

  // The outer ring's bonus: the wheel's average is what the table's BONUS segment is priced with.
  const outer = ringTable("OUTER", rtp);
  const wheel = wheelSegments("OUTER");
  const weight = wheel.reduce((s, w) => s + w.weight, 0);
  const meanFinal = wheel.reduce((s, w) => s + ((200 + w.add) * w.weight) / weight, 0);
  check(`outer BONUS: the wheel averages ${meanFinal}X (${wheel.map((w) => `+${w.add} ${w.weight}%`).join(", ")}) and the segment is priced with it`, Math.abs(outer[7].multiplier - meanFinal) < 1e-9 && Math.abs(outer[7].reach * meanFinal - rtp) < 1e-12);
  check("the wheel can only add its own values and its weights add up to 100", weight === 100 && wheel.every((w) => w.add > 0));

  // A part cash-out: half of what is in play now, the other half goes on. Any plan returns the same.
  const plans: { name: string; ring: RingKey; take: number[]; stop: number }[] = [
    { name: "half at 2 then stop at 4", ring: "OUTER", take: [2], stop: 4 },
    { name: "half at 1, half of the rest at 2, stop at 3", ring: "MIDDLE", take: [1, 2], stop: 3 },
    { name: `${MAX_PART_CASHOUTS} part cash-outs then stop at the end`, ring: "INNER", take: [1, 2, 3].slice(0, MAX_PART_CASHOUTS), stop: 4 },
  ];
  for (const plan of plans) {
    const table = ringTable(plan.ring, rtp);
    let share = 1;
    let ev = 0;
    for (const k of plan.take) {
      ev += table[k - 1].reach * table[k - 1].multiplier * share * 0.5;
      share *= 0.5;
    }
    ev += table[plan.stop - 1].reach * table[plan.stop - 1].multiplier * share;
    check(`a part cash-out changes nothing: ${plan.ring}, ${plan.name} returns ${(ev * 100).toFixed(4)}%`, Math.abs(ev - rtp) < 1e-12);
  }
}

// ---- 3. simulated rounds with real draws
{
  const N = 600_000;
  for (const ring of RING_KEYS) {
    const table = ringTable(ring, rtp);
    const sums = new Array(table.length).fill(0);
    const squares = new Array(table.length).fill(0);
    for (let i = 0; i < N; i++) {
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      const out = playRing(ring, rtp, table.length, (step) => fairRandomFloat(serverSeed, clientSeed, i * 1000 + step), () => fairRandomFloat(serverSeed, clientSeed, i * 1000 + 900));
      // Everything that is survived up to a segment pays the multiplier of that segment to a player who stops there.
      for (let k = 1; k <= out.survived; k++) {
        const pay = k === table.length ? multiplierAfter(ring, k, out.bonus) : table[k - 1].multiplier;
        sums[k - 1] += pay;
        squares[k - 1] += pay * pay;
      }
    }
    const rows: string[] = [];
    let ok = true;
    for (let k = 0; k < table.length; k++) {
      const mean = sums[k] / N;
      const sd = Math.sqrt(Math.max(0, squares[k] / N - mean * mean));
      const se = sd / Math.sqrt(N);
      const within = Math.abs(mean - rtp) <= 4 * se + 1e-9;
      ok = ok && within;
      rows.push(`${table[k].label} ${(mean * 100).toFixed(1)}%`);
    }
    check(`${ring}: ${N.toLocaleString()} simulated rounds return ${(rtp * 100).toFixed(0)}% for every stopping segment (within four standard errors)`, ok, `(${rows.join(", ")})`);
  }
}

// ---- 4. replay and the wheel
{
  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const play = () => playRing("OUTER", rtp, 8, (step) => fairRandomFloat(serverSeed, clientSeed, 7 * 1000 + step), () => fairRandomFloat(serverSeed, clientSeed, 7 * 1000 + 900));
  check("a round replayed from the same seeds is the same round", JSON.stringify(play()) === JSON.stringify(play()));
  const counts = new Map<number, number>();
  const M = 200_000;
  for (let i = 0; i < M; i++) {
    const add = wheelAdd("OUTER", (i + 0.5) / M);
    counts.set(add, (counts.get(add) ?? 0) + 1);
  }
  check("the bonus wheel follows its weights", wheelSegments("OUTER").every((w) => Math.abs((counts.get(w.add) ?? 0) / M - w.weight / 100) < 1e-4));
  check("the middle and inner rings add their fixed amount", wheelAdd("MIDDLE", 0.3) === 20.5 && wheelAdd("INNER", 0.99) === 7);
  const a = playRing("INNER", rtp, 2, () => 0.0, () => 0);
  const b = playRing("INNER", rtp, 2, () => 0.9999, () => 0);
  check("a round stops at the segment asked for, and a failed segment ends it", a.survived === 2 && !a.eliminated && a.bonus === 0 && b.eliminated && b.survived === 0);
  const c = playRing("MIDDLE", rtp, 6, () => 0.0, () => 0.5);
  check("surviving the last segment draws the bonus", c.survived === 6 && !c.eliminated && c.bonus === 20.5);
}

console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);

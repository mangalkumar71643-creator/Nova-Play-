/**
 * Checks Ring Gauntlet's maths without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-ring-gauntlet.ts
 *
 * Both odds tables are checked: the current one (2, the gentle table of 2026-11-26) and the first one (1), which the
 * rounds started before it still finish on (ringGauntletEngine.ts PAYTABLES).
 *
 * 1. The rings are what the game shows: 8, 6 and 4 segments, the labels and multipliers of the screen, climbing in value,
 *    with a bonus on the last segment of each ring. On the current table every segment of a ring is about as hard as
 *    the next.
 * 2. The return is exact: for every ring and every segment, multiplier x chance of getting there = the return to player
 *    (so stopping anywhere, on any ring, returns the same), the outer ring's bonus wheel included, and a part cash-out
 *    (half now, half later) returns it too.
 * 3. Simulated rounds (the real play code, the provably fair draws of random seeds) return the exact figure for every
 *    stopping segment within four standard errors.
 * 4. A round replayed from the same seeds is the same round, and the bonus wheel follows its weights.
 * 5. A stored round is read on its own table (paytableOf).
 *
 * It prints every check and exits with 1 if one fails.
 */
import { env } from "../src/config/env";
import {
  CURRENT_PAYTABLE,
  MAX_PART_CASHOUTS,
  Paytable,
  RING_KEYS,
  RingKey,
  multiplierAfter,
  paytableOf,
  playRing,
  ringShape,
  ringSteps,
  ringTable,
  wheelAdd,
  wheelSegments,
} from "../src/services/ringGauntletEngine";
import { fairRandomFloat, generateClientSeed, generateServerSeed } from "../src/utils/rng";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const rtp = env.games.rtp;
const TABLES: Paytable[] = [2, 1];
const LABELS: Record<Paytable, Record<RingKey, string[]>> = {
  1: {
    OUTER: ["3.9X", "12.5X", "28X", "52X", "85X", "133X", "200X", "BONUS"],
    MIDDLE: ["2.5X", "7.7X", "16X", "27.5X", "44X", "+20.5X"],
    INNER: ["1.55X", "4.85X", "10X", "+7X"],
  },
  2: {
    OUTER: ["1.9X", "4X", "8.4X", "17.7X", "37X", "78X", "165X", "BONUS"],
    MIDDLE: ["1.8X", "3.6X", "7.2X", "14.4X", "28.8X", "+28.8X"],
    INNER: ["1.3X", "1.9X", "2.8X", "+1.4X"],
  },
};
/** What the plus segments add, and the multiplier they make (table: [middle add, middle total, inner add, inner total]). */
const PLUS: Record<Paytable, [number, number, number, number]> = { 1: [20.5, 64.5, 7, 17], 2: [28.8, 57.6, 1.4, 4.2] };

check(`the current table is table 2 (the gentle one)`, CURRENT_PAYTABLE === 2);

// ---- 1. the rings
for (const pt of TABLES) {
  for (const ring of RING_KEYS) {
    const table = ringTable(ring, rtp, pt);
    const labels = LABELS[pt][ring];
    check(`table ${pt}, ${ring}: ${labels.length} segments, labelled ${labels.join(" ")}`, table.length === labels.length && table.every((s, i) => s.label === labels[i]) && ringSteps(ring, pt) === table.length);
    check(`table ${pt}, ${ring}: the multipliers climb, the last segment is a bonus`, table.every((s, i) => i === 0 || s.multiplier > table[i - 1].multiplier) && table[table.length - 1].kind !== "x");
    check(`table ${pt}, ${ring}: every chance is a real chance (0 to 1) and the chance of getting there only falls`, table.every((s, i) => s.survive > 0 && s.survive <= 1 && s.reach > 0 && (i === 0 || s.reach < table[i - 1].reach)));
  }
  const [mAdd, mTotal, iAdd, iTotal] = PLUS[pt];
  const mid = ringTable("MIDDLE", rtp, pt);
  const inn = ringTable("INNER", rtp, pt);
  check(
    `table ${pt}: the plus segments add to the multiplier before them: ${mid[4].multiplier} + ${mAdd} = ${mTotal} and ${inn[2].multiplier} + ${iAdd} = ${iTotal}`,
    multiplierAfter("MIDDLE", 6, mAdd, pt) === mTotal && multiplierAfter("INNER", 4, iAdd, pt) === iTotal && mid[5].multiplier === mTotal && inn[3].multiplier === iTotal
  );
}
check("the badges: outer square, middle triangle, inner circle", ringShape("OUTER") === "SQUARE" && ringShape("MIDDLE") === "TRIANGLE" && ringShape("INNER") === "CIRCLE");
check("the tables have the same rings and segments (the wheel art is the same)", RING_KEYS.every((r) => ringSteps(r, 1) === ringSteps(r, 2)));
{
  // The gentle table: every segment of a ring about as hard as the next (the first table had 23%-36% first segments).
  const band: Record<RingKey, [number, number]> = { INNER: [0.66, 0.7], MIDDLE: [0.499, 0.501], OUTER: [0.47, 0.53] };
  for (const ring of RING_KEYS) {
    const table = ringTable(ring, rtp, 2);
    const [lo, hi] = band[ring];
    check(
      `table 2, ${ring}: every segment is survived ${Math.round(lo * 100)}-${Math.round(hi * 100)}% of the time (first press out ${(100 * (1 - table[0].survive)).toFixed(0)}%, was ${(100 * (1 - ringTable(ring, rtp, 1)[0].survive)).toFixed(0)}%)`,
      table.every((s) => s.survive >= lo && s.survive <= hi),
      table.map((s) => `${s.label} ${(s.survive * 100).toFixed(1)}%`).join(", ")
    );
  }
}

// ---- 2. exact return
for (const pt of TABLES) {
  let worst = 0;
  for (const ring of RING_KEYS) {
    const table = ringTable(ring, rtp, pt);
    let chance = 1;
    for (const seg of table) {
      chance *= seg.survive; // the product of the chances of every segment so far
      worst = Math.max(worst, Math.abs(chance * seg.multiplier - rtp));
    }
    console.log(`     table ${pt}, ${ring}: ${table.map((s) => `${s.label} ${(s.reach * 100).toFixed(4)}%`).join(", ")}`);
  }
  check(`table ${pt}: stopping on any segment of any ring returns exactly ${(rtp * 100).toFixed(2)}% of the stake (largest error ${worst.toExponential(1)})`, worst < 1e-12);

  // The outer ring's bonus: the wheel's average is what the table's BONUS segment is priced with.
  const outer = ringTable("OUTER", rtp, pt);
  const wheel = wheelSegments("OUTER", pt);
  const weight = wheel.reduce((s, w) => s + w.weight, 0);
  const lastPlain = outer[6].multiplier;
  const meanFinal = wheel.reduce((s, w) => s + ((lastPlain + w.add) * w.weight) / weight, 0);
  check(
    `table ${pt}: outer BONUS: the wheel averages ${meanFinal}X (${lastPlain}X ${wheel.map((w) => `+${w.add} ${w.weight}%`).join(", ")}) and the segment is priced with it`,
    Math.abs(outer[7].multiplier - meanFinal) < 1e-9 && Math.abs(outer[7].reach * meanFinal - rtp) < 1e-12
  );
  check(`table ${pt}: the wheel can only add its own values and its weights add up to 100`, weight === 100 && wheel.every((w) => w.add > 0));

  // A part cash-out: half of what is in play now, the other half goes on. Any plan returns the same.
  const plans: { name: string; ring: RingKey; take: number[]; stop: number }[] = [
    { name: "half at 2 then stop at 4", ring: "OUTER", take: [2], stop: 4 },
    { name: "half at 1, half of the rest at 2, stop at 3", ring: "MIDDLE", take: [1, 2], stop: 3 },
    { name: `${MAX_PART_CASHOUTS} part cash-outs then stop at the end`, ring: "INNER", take: [1, 2, 3].slice(0, MAX_PART_CASHOUTS), stop: 4 },
  ];
  for (const plan of plans) {
    const table = ringTable(plan.ring, rtp, pt);
    let share = 1;
    let ev = 0;
    for (const k of plan.take) {
      ev += table[k - 1].reach * table[k - 1].multiplier * share * 0.5;
      share *= 0.5;
    }
    ev += table[plan.stop - 1].reach * table[plan.stop - 1].multiplier * share;
    check(`table ${pt}: a part cash-out changes nothing: ${plan.ring}, ${plan.name} returns ${(ev * 100).toFixed(4)}%`, Math.abs(ev - rtp) < 1e-12);
  }
}

// ---- 3. simulated rounds with real draws
for (const pt of TABLES) {
  const N = pt === CURRENT_PAYTABLE ? 600_000 : 200_000;
  for (const ring of RING_KEYS) {
    const table = ringTable(ring, rtp, pt);
    const sums = new Array(table.length).fill(0);
    const squares = new Array(table.length).fill(0);
    for (let i = 0; i < N; i++) {
      const serverSeed = generateServerSeed();
      const clientSeed = generateClientSeed();
      const out = playRing(ring, rtp, table.length, (step) => fairRandomFloat(serverSeed, clientSeed, i * 1000 + step), () => fairRandomFloat(serverSeed, clientSeed, i * 1000 + 900), pt);
      // Everything that is survived up to a segment pays the multiplier of that segment to a player who stops there.
      for (let k = 1; k <= out.survived; k++) {
        const pay = k === table.length ? multiplierAfter(ring, k, out.bonus, pt) : table[k - 1].multiplier;
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
    check(`table ${pt}, ${ring}: ${N.toLocaleString()} simulated rounds return ${(rtp * 100).toFixed(0)}% for every stopping segment (within four standard errors)`, ok, `(${rows.join(", ")})`);
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
  for (const pt of TABLES) {
    const [mAdd, , iAdd] = PLUS[pt];
    check(`table ${pt}: the middle and inner rings add their fixed amount (+${mAdd}, +${iAdd})`, wheelAdd("MIDDLE", 0.3, pt) === mAdd && wheelAdd("INNER", 0.99, pt) === iAdd);
    const c = playRing("MIDDLE", rtp, 6, () => 0.0, () => 0.5, pt);
    check(`table ${pt}: surviving the last segment draws the bonus`, c.survived === 6 && !c.eliminated && c.bonus === mAdd);
  }
  const a = playRing("INNER", rtp, 2, () => 0.0, () => 0);
  const b = playRing("INNER", rtp, 2, () => 0.9999, () => 0);
  check("a round stops at the segment asked for, and a failed segment ends it", a.survived === 2 && !a.eliminated && a.bonus === 0 && b.eliminated && b.survived === 0);
  // The same draw can end differently on the two tables: the middle ring's first segment is survived by a draw under 0.36
  // on table 1 and under 0.5 on table 2, so 0.45 is out on the first and survived on the second.
  const first = (pt: Paytable) => playRing("MIDDLE", rtp, 1, () => 0.45, () => 0, pt);
  check("each table uses its own chances: a draw of 0.45 on the middle ring's first segment is out on table 1, survived on table 2", first(1).eliminated && !first(2).eliminated);
}

// ---- 5. stored rounds
check(
  "a stored round is read on its own table: 1 stays 1, 2 stays 2, nothing stored or anything unknown is the current table",
  paytableOf(1) === 1 && paytableOf(2) === 2 && paytableOf(null) === CURRENT_PAYTABLE && paytableOf(undefined) === CURRENT_PAYTABLE && paytableOf(7) === CURRENT_PAYTABLE
);

console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);

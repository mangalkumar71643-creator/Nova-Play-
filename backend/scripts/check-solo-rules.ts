/**
 * Checks Admin → Result Rules (soloRuleService.ts), the rule for a round with exactly one player in the least-rule games,
 * without a database:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-solo-rules.ts
 *
 * 1. Defaults (nothing saved): Win Go and Trx Win Go RANDOM with the House at WINGO_SOLO_HOUSE_CHANCE (40%), every other
 *    game LEAST, as before the setting existed.
 * 2. keepsOwnResult: never with two or more players, never under LEAST; under RANDOM in (1 - House share) of rounds, drawn
 *    from the round's seed (the same answer every time for the same round).
 * 3. Win Go's resultForBets: with the defaults it gives exactly what it gave before the setting (same draws); under LEAST
 *    a player alone gets the least-money number; RANDOM with the House at 0% keeps the round's own number; at 100% a lone
 *    bet always loses; two players always follow the least-money rule.
 * 4. The stored setting is read safely: bad JSON, unknown games and out-of-range shares are left out.
 *
 * It prints every check and exits with 1 if one fails.
 */
import { runtimeSettings } from "../src/config/runtimeSettings";
import { env } from "../src/config/env";
import { fairGameFloat, generateServerSeed } from "../src/utils/rng";
import { SOLO_GAME_KEYS, keepsOwnResult, listSoloRules, parseSoloRules, soloRuleFor, soloRuleView } from "../src/services/soloRuleService";
import { leastStakedNumber, payoutMultiplier, resultForBets } from "../src/services/winGoService";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

const ONE = [{ userId: "a" }];
const TWO = [{ userId: "a" }, { userId: "b" }];

// ---- 1. defaults
{
  runtimeSettings.soloRules = undefined;
  check("Win Go defaults to RANDOM with the House at WINGO_SOLO_HOUSE_CHANCE", soloRuleFor("winGo").mode === "RANDOM" && soloRuleFor("winGo").houseChance === env.games.winGoSoloHouseChance, `(${env.games.winGoSoloHouseChance})`);
  check("Trx Win Go defaults to the same", soloRuleFor("trxWinGo").mode === "RANDOM" && soloRuleFor("trxWinGo").houseChance === env.games.winGoSoloHouseChance);
  check("the nine other games default to LEAST", SOLO_GAME_KEYS.filter((g) => g !== "winGo" && g !== "trxWinGo").every((g) => soloRuleFor(g).mode === "LEAST"));
  check("the admin list has all 11 games", listSoloRules().length === 11 && new Set(listSoloRules().map((r) => r.key)).size === 11);
  check("LEAST is reported to the apps as the House taking 100%", soloRuleView("k3").houseChancePercent === 100 && soloRuleView("winGo").houseChancePercent === Math.round(env.games.winGoSoloHouseChance * 10000) / 100);
}

// ---- 2. keepsOwnResult
{
  const N = 20000;
  const seeds = Array.from({ length: N }, (_, i) => ({ seed: generateServerSeed(), period: `P${i}` }));
  runtimeSettings.soloRules = { k3: { mode: "RANDOM", houseChance: 0.4 }, dragonTiger: { mode: "LEAST", houseChance: 1 } };
  const kept = seeds.filter((s) => keepsOwnResult("k3", ONE, s.seed, s.period)).length / N;
  check(`RANDOM, House 40%: one player keeps the round's own result in ~60% of rounds (${(kept * 100).toFixed(1)}%)`, Math.abs(kept - 0.6) < 0.015);
  check("the same round always gives the same answer", seeds.slice(0, 200).every((s) => keepsOwnResult("k3", ONE, s.seed, s.period) === keepsOwnResult("k3", ONE, s.seed, s.period)));
  check("the answer is the round's own seed draw (HMAC message '<game>-solo')", seeds.slice(0, 500).every((s) => keepsOwnResult("k3", ONE, s.seed, s.period) === fairGameFloat(s.seed, s.period, "k3-solo", 0) >= 0.4));
  check("two players never keep the own result (the least rule decides)", seeds.slice(0, 500).every((s) => !keepsOwnResult("k3", TWO, s.seed, s.period)));
  check("LEAST: one player never keeps the own result", seeds.slice(0, 500).every((s) => !keepsOwnResult("dragonTiger", ONE, s.seed, s.period)));
  check("no bets: not a one-player round", !keepsOwnResult("k3", [], seeds[0].seed, seeds[0].period));
  runtimeSettings.soloRules = { k3: { mode: "RANDOM", houseChance: 0 }, fiveD: { mode: "RANDOM", houseChance: 1 } };
  check("RANDOM with the House at 0%: always the round's own result", seeds.slice(0, 500).every((s) => keepsOwnResult("k3", ONE, s.seed, s.period)));
  check("RANDOM with the House at 100%: never", seeds.slice(0, 500).every((s) => !keepsOwnResult("fiveD", ONE, s.seed, s.period)));
}

// ---- 3. Win Go's resultForBets
{
  // What the function did before the setting existed (winGoService.ts until 2026-11-26), for the comparison.
  const before = (bets: { userId: string; area: string; amount: unknown }[], natural: number, seed: string, period: string) => {
    if (new Set(bets.map((b) => b.userId)).size !== 1) return leastStakedNumber(bets, seed, period);
    if (fairGameFloat(seed, period, "wingo-solo", 0) >= env.games.winGoSoloHouseChance) return natural;
    const paid = Array.from({ length: 10 }, (_, n) => bets.reduce((sum, b) => sum + Math.round(Number(b.amount) * payoutMultiplier(b.area, n) * 100), 0));
    const least = Math.min(...paid);
    const tied = paid.flatMap((p, n) => (p === least ? [n] : []));
    return tied[Math.floor(fairGameFloat(seed, period, "wingo-solo", 1) * tied.length)];
  };
  const AREAS = ["GREEN", "RED", "VIOLET", "BIG", "SMALL", "NUM:0", "NUM:3", "NUM:5", "NUM:7", "NUM:8"];
  const cases = Array.from({ length: 4000 }, (_, i) => {
    const seed = generateServerSeed();
    const k = 1 + (i % 3);
    const bets = Array.from({ length: k }, (_, j) => ({ userId: i % 5 === 0 && j === 1 ? "b" : "a", area: AREAS[(i * 7 + j * 3) % AREAS.length], amount: 10 * (1 + ((i + j) % 9)) }));
    return { seed, period: `W${i}`, bets, natural: Math.floor(fairGameFloat(seed, `W${i}`, "n", 0) * 10) };
  });
  runtimeSettings.soloRules = undefined;
  check("defaults: Win Go's number is exactly what it was before the setting (4,000 periods)", cases.every((c) => resultForBets(c.bets, c.natural, c.seed, c.period) === before(c.bets, c.natural, c.seed, c.period)));
  check("defaults: Trx Win Go too", cases.every((c) => resultForBets(c.bets, c.natural, c.seed, c.period, "trxWinGo") === before(c.bets, c.natural, c.seed, c.period)));
  runtimeSettings.soloRules = { winGo: { mode: "LEAST", houseChance: 1 } };
  const solo = cases.filter((c) => new Set(c.bets.map((b) => b.userId)).size === 1);
  check("LEAST: a player alone gets the least-money number", solo.every((c) => resultForBets(c.bets, c.natural, c.seed, c.period) === leastStakedNumber(c.bets, c.seed, c.period)));
  const singleBet = solo.filter((c) => c.bets.length === 1);
  check(`LEAST: a lone single bet never wins (${singleBet.length} periods)`, singleBet.every((c) => payoutMultiplier(c.bets[0].area, resultForBets(c.bets, c.natural, c.seed, c.period)) === 0));
  check("LEAST on Win Go leaves Trx Win Go on its own rule", cases.every((c) => resultForBets(c.bets, c.natural, c.seed, c.period, "trxWinGo") === before(c.bets, c.natural, c.seed, c.period)));
  runtimeSettings.soloRules = { winGo: { mode: "RANDOM", houseChance: 0 } };
  check("RANDOM, House 0%: a player alone gets the period's own number", solo.every((c) => resultForBets(c.bets, c.natural, c.seed, c.period) === c.natural));
  runtimeSettings.soloRules = { winGo: { mode: "RANDOM", houseChance: 1 } };
  check("RANDOM, House 100%: a lone single bet never wins", singleBet.every((c) => payoutMultiplier(c.bets[0].area, resultForBets(c.bets, c.natural, c.seed, c.period)) === 0));
  const multi = cases.filter((c) => new Set(c.bets.map((b) => b.userId)).size > 1);
  for (const rule of [{ mode: "LEAST" as const, houseChance: 1 }, { mode: "RANDOM" as const, houseChance: 0 }]) {
    runtimeSettings.soloRules = { winGo: rule };
    check(`two players follow the least-money rule whatever the setting (${rule.mode}, ${multi.length} periods)`, multi.every((c) => resultForBets(c.bets, c.natural, c.seed, c.period) === leastStakedNumber(c.bets, c.seed, c.period)));
  }
}

// ---- 4. reading the stored setting
{
  check("bad JSON is ignored", parseSoloRules("{not json") === undefined);
  check("nothing stored: no rules", parseSoloRules(null) === undefined && parseSoloRules("") === undefined);
  const p = parseSoloRules(JSON.stringify({ winGo: { mode: "LEAST", houseChance: 1 }, k3: { mode: "RANDOM", houseChance: 0.25 }, nope: { mode: "LEAST", houseChance: 1 }, roulette: { mode: "RANDOM", houseChance: 1.5 }, baccarat: { mode: "SOMETIMES", houseChance: 0.2 } }));
  check("good entries are kept, unknown games and out-of-range or unknown values are left out", JSON.stringify(p) === JSON.stringify({ winGo: { mode: "LEAST", houseChance: 1 }, k3: { mode: "RANDOM", houseChance: 0.25 } }), JSON.stringify(p));
}

console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);

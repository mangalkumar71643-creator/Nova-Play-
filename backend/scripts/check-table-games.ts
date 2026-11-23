/**
 * Checks the shared-table games (Dragon Tiger, 7 Up Down, Andar Bahar, Teen Patti, Roulette, Baccarat) under the least-payout rule
 * with the 2% tax they pay since 2026-11-23 (their odds are the fair odds less 2%, i.e. a 98% setting; Win Go, K3 and 5D take the
 * same tax). No database needed:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check TABLE_LEAST_PAYOUT=true npx tsx scripts/check-table-games.ts
 *
 * 1. With the default settings the odds are the 98% ones (the table the owner was shown) and every config reports the 2% tax.
 * 2. The house cannot lose a round: on random and on nasty crowds (any mix of boxes, stakes from Rs1 to Rs100000) what the result
 *    the rule picks pays is never more than was staked, and the house keeps at least the tax in every round. (The rule picks the
 *    cheapest result, which cannot cost more than the average result, which returns the 98% the odds are set for.)
 * 3. The rule itself is unchanged: a bet that is alone on a round never wins when some result does not pay it.
 *
 * It prints every check and exits with 1 if one fails.
 */
import crypto from "crypto";
import { env } from "../src/config/env";
import * as DT from "../src/services/dragonTigerService";
import * as UD from "../src/services/sevenUpDownService";
import * as AB from "../src/services/andarBaharService";
import * as TP from "../src/services/teenPattiService";
import * as RL from "../src/services/rouletteService";
import * as BC from "../src/services/baccaratService";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}

type Bet = { area: string; amount: number };
const ri = (n: number) => crypto.randomInt(0, n);
let n = 0;
const seeds = () => ({ seed: crypto.randomBytes(16).toString("hex"), period: "26112" + String(n++).padStart(7, "0") });
const floor2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

// What the result the rule picks pays on a set of bets, for each game.
const games: Record<string, { areas: string[]; pay: (bets: Bet[]) => number }> = {
  "Dragon Tiger": { areas: [...DT.AREAS], pay: (bets) => { const { seed, period } = seeds(); const [d, t] = DT.leastPayoutCards(bets, seed, period); return bets.reduce((s, b) => s + (DT.areaWins(b.area as any, d, t) ? floor2(b.amount * DT.multiplierFor(b.area as any)) : 0), 0); } },
  "7 Up Down": { areas: [...UD.AREAS], pay: (bets) => { const { seed, period } = seeds(); const [a, c] = UD.leastPayoutDice(bets, seed, period); return bets.reduce((s, b) => s + (UD.areaWins(b.area as any, a + c) ? floor2(b.amount * UD.multiplierFor(b.area as any)) : 0), 0); } },
  "Andar Bahar": { areas: [...AB.AREAS], pay: (bets) => { const { seed, period } = seeds(); const { cards } = AB.leastPayoutDeal(bets, seed, period); return bets.reduce((s, b) => s + (AB.areaWins(b.area as any, cards) ? floor2(b.amount * AB.multiplierFor(b.area as any)) : 0), 0); } },
  "Teen Patti": { areas: [...TP.AREAS], pay: (bets) => { const { seed, period } = seeds(); const cards = TP.leastPayoutDeal(bets, seed, period); return bets.reduce((s, b) => s + (TP.areaWins(b.area as any, cards) ? floor2(b.amount * TP.multiplierFor(b.area as any)) : 0), 0); } },
  Roulette: { areas: [...RL.SPOTS.keys()], pay: (bets) => { const { seed, period } = seeds(); const r = RL.leastPayoutResult(bets, seed, period); return bets.reduce((s, b) => s + (RL.spotWins(b.area, r) ? floor2(b.amount * RL.multiplierFor(b.area)) : 0), 0); } },
  Baccarat: { areas: [...BC.AREAS], pay: (bets) => { const { seed, period } = seeds(); const { player, banker } = BC.leastPayoutHand(bets, seed, period); return bets.reduce((s, b) => s + floor2(b.amount * BC.paidMultiplierFor(b.area as any, BC.multiplierFor(b.area as any), player, banker)), 0); } },
};

// ---- 1. the odds and the configs
const defaults = env.games.tableRtp === 0.98 && env.games.sevenUpDownRtp === 0.98;
if (defaults) {
  check("Dragon Tiger: Dragon / Tiger 2.12, Tie 12.74, Suited Tie 50.96", DT.multiplierFor("DRAGON") === 2.12 && DT.multiplierFor("TIGER") === 2.12 && DT.multiplierFor("TIE") === 12.74 && DT.multiplierFor("SUITED_TIE") === 50.96);
  check("7 Up Down: Down / Up 2.35, Seven 5.88, total 2 or 12 35.28", UD.multiplierFor("DOWN") === 2.35 && UD.multiplierFor("UP") === 2.35 && UD.multiplierFor("SEVEN") === 5.88 && UD.multiplierFor("N2") === 35.28 && UD.multiplierFor("N12") === 35.28);
  check("Andar Bahar: Andar 1.9, Bahar 2.02, 36-49 cards 36.44", AB.multiplierFor("ANDAR") === 1.9 && AB.multiplierFor("BAHAR") === 2.02 && AB.multiplierFor("C36_49") === 36.44);
  check("Teen Patti: A / B 1.96, Tie 885.68", TP.multiplierFor("PLAYER_A") === 1.96 && TP.multiplierFor("PLAYER_B") === 1.96 && TP.multiplierFor("TIE") === 885.68);
  check("Roulette: 1 number 36.26, 18 numbers 2.01", RL.multiplierForCount(1) === 36.26 && RL.multiplierForCount(18) === 2.01);
  check("Baccarat: Player 1.98, Banker 1.92, Tie 10.26, Pair 12.74", BC.multiplierFor("PLAYER") === 1.98 && BC.multiplierFor("BANKER") === 1.92 && BC.multiplierFor("TIE") === 10.26 && BC.multiplierFor("PLAYER_PAIR") === 12.74);
} else {
  console.log("(TABLE_GAME_RTP / SEVEN_UP_DOWN_RTP are set: the odds are not the default ones, their values are not checked)");
}
const taxOf = (cfg: { taxPercent?: number }) => cfg.taxPercent;
check(
  "every table game's config reports the tax (taxPercent = 100 - rtp)",
  [taxOf(DT.getDragonTigerConfig()), taxOf(AB.getAndarBaharConfig()), taxOf(TP.getTeenPattiConfig()), taxOf(RL.getRouletteConfig()), taxOf(BC.getBaccaratConfig())].every((t) => t === Math.round((1 - env.games.tableRtp) * 10000) / 100) &&
    taxOf(UD.getSevenUpDownConfig()) === Math.round((1 - env.games.sevenUpDownRtp) * 10000) / 100
);

// ---- 2. the house cannot lose a round
const AMOUNTS = [1, 5, 10, 50, 100, 500, 1000, 10000, 100000];
const ROUNDS = Number(process.env.ROUNDS ?? 400);
for (const [name, g] of Object.entries(games)) {
  const tax = name === "7 Up Down" ? 1 - env.games.sevenUpDownRtp : 1 - env.games.tableRtp;
  let losing = 0;
  let smallest = Infinity;
  for (let r = 0; r < ROUNDS; r++) {
    const count = 1 + ri(40);
    const bets: Bet[] = [];
    for (let i = 0; i < count; i++) bets.push({ area: g.areas[ri(g.areas.length)], amount: AMOUNTS[ri(AMOUNTS.length)] });
    const staked = bets.reduce((s, b) => s + b.amount, 0);
    const paid = g.pay(bets);
    if (paid > staked + 1e-9) losing++;
    smallest = Math.min(smallest, (staked - paid) / staked);
  }
  check(`${name}: ${ROUNDS} random and nasty rounds, the house never pays out more than was staked`, losing === 0, `(lost ${losing})`);
  check(`${name}: the house keeps at least the tax (${(tax * 100).toFixed(0)}%) in every round`, smallest >= tax - 1e-9, `(smallest ${(smallest * 100).toFixed(2)}%)`);
}

// ---- 3. the rule is unchanged: a bet alone on a round does not win (some other result pays nothing)
const lone: [string, string][] = [["Dragon Tiger", "DRAGON"], ["7 Up Down", "DOWN"], ["Andar Bahar", "ANDAR"], ["Teen Patti", "PLAYER_A"], ["Roulette", [...RL.SPOTS.keys()][0]], ["Baccarat", "PLAYER"]];
for (const [name, area] of lone) {
  let wins = 0;
  for (let i = 0; i < 60; i++) if (games[name].pay([{ area, amount: 100 }]) > 100) wins++; // paid more than the stake = it won (a Baccarat tie only hands the stake back)
  check(`${name}: a lone bet on ${area} never wins`, wins === 0, `(won ${wins} of 60)`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);

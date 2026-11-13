import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

export type VortexElement = "WATER" | "EARTH" | "FIRE";
export type VortexSymbol = VortexElement | "WIND" | "SKULL";

/**
 * The board: three rings, one per element. The bet is taken on the first
 * spin of a round; every spin after it is free until the round ends. Each
 * spin lands one symbol —
 *   Water / Earth / Fire  fills the next section of its ring;
 *   Wind                  does nothing (the next spin is free as well);
 *   Skull                 takes one section off every ring.
 * A ring is worth its last filled section's multiplier x the bet. CASH OUT
 * pays all three rings and ends the round; PART PAYOUT pays, for each ring
 * with two or more sections, the step between its last two sections and
 * moves that ring back one (the round goes on). The round is lost (CRASH)
 * when a Skull leaves the board empty, a Skull on the first spin included.
 *
 * `ladder` is what each section is worth. A hit on a full ring pays its
 * `bonus` x the bet at once and the ring stays full; a hit on the full Fire
 * ring pays its x200 plus one of FIRE_PREMIUMS and empties it.
 */
export const RINGS: Record<VortexElement, { ladder: number[]; bonus: number }> = {
  WATER: { ladder: [1.55, 4.85, 10], bonus: 7 },
  EARTH: { ladder: [2.5, 7.7, 16, 27.5, 44], bonus: 20.5 },
  FIRE: { ladder: [3.9, 12.5, 28, 52, 85, 133, 200], bonus: 0 },
};
export const FIRE_PREMIUMS = [100, 200, 300, 400, 500];
export const ELEMENT_ORDER: VortexElement[] = ["WATER", "EARTH", "FIRE"];

/** How the spins that land an element are split between the three (Water the most, Fire the least). */
const ELEMENT_WEIGHT: Record<VortexElement, number> = { WATER: 0.6, EARTH: 0.28, FIRE: 0.12 };
/** Share of spins that land Wind, on every board. */
const WIND_CHANCE = 0.3;
/** A round is cashed out by itself after this many spins (it also keeps
 * each round's spins inside its own `nonce * 1000 + spin` slice). */
export const MAX_SPINS = 1000;

/** Codes kept in `segments`, one per thing that happened in the round. */
const EVENT_CODE: Record<VortexSymbol | "PART_PAYOUT", number> = { WATER: 0, EARTH: 1, FIRE: 2, WIND: 3, SKULL: 4, PART_PAYOUT: 5 };

export type Fill = { water: number; earth: number; fire: number };
const FILL_KEY: Record<VortexElement, keyof Fill> = { WATER: "water", EARTH: "earth", FIRE: "fire" };

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-6) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** bet x multiplier, rounded down to the paisa (worked in whole paise and
 * hundredths of a multiplier, so no fraction is lost on the way). */
function winAmount(bet: number, multiplier: number): number {
  return Math.floor((Math.round(bet * 100) * Math.round(multiplier * 100)) / 100) / 100;
}

function rtp(): number {
  return 1 - env.games.crashHouseEdge;
}

/** What a ring with `level` sections filled is worth, as a multiple of the bet. */
export function ringValue(element: VortexElement, level: number): number {
  return level <= 0 ? 0 : RINGS[element].ladder[Math.min(level, RINGS[element].ladder.length) - 1];
}

export function boardMultiplier(fill: Fill): number {
  return ELEMENT_ORDER.reduce((sum, el) => sum + ringValue(el, fill[FILL_KEY[el]]), 0);
}

/** What one more hit adds to a ring at `level` (on a full ring: its bonus). */
function gainOnHit(element: VortexElement, level: number): number {
  const { ladder, bonus } = RINGS[element];
  if (level < ladder.length) return ladder[level] - ringValue(element, level);
  // The Fire bonus pays the ring's x200 and a premium, and empties the ring:
  // what the player is up by is the premium.
  return element === "FIRE" ? FIRE_PREMIUMS.reduce((a, b) => a + b, 0) / FIRE_PREMIUMS.length : bonus;
}

function lossOnSkull(element: VortexElement, level: number): number {
  return level > 0 ? ringValue(element, level) - ringValue(element, level - 1) : 0;
}

/** What a Skull takes off this board (each ring's last step), as a multiple of the bet. */
function skullLoss(fill: Fill): number {
  return ELEMENT_ORDER.reduce((sum, el) => sum + lossOnSkull(el, fill[FILL_KEY[el]]), 0);
}

export type Chances = Record<VortexSymbol, number>;

/**
 * The chance of each symbol on the next spin, for this board.
 *
 * Elements always come in the ELEMENT_WEIGHT mix and Wind is WIND_CHANCE;
 * the Skull takes the rest, set so that the round is worth rtp x the bet:
 *
 * - On an empty board (the first spin; Wind keeps it empty) an element is
 *   worth its ring's first section and a Skull ends the round with nothing,
 *   so the round is worth  sum(element chance x first section) / (1 - Wind).
 *   That is set to rtp.
 * - Once something is on the board, every free spin is a fair one: what the
 *   elements add (a ring's next section, or a full ring's bonus) on average
 *   equals what a Skull takes off on average —
 *       sum(element chance x gain) = Skull chance x skullLoss(board).
 *
 * So the board is always worth, on average, exactly what it shows: cashing
 * out, part payouts, stopping or going on — no way of playing returns more
 * than rtp. Rounding down and the payout limit only lower it.
 */
export function spinChances(fill: Fill, returnToPlayer = rtp()): Chances {
  const notWind = 1 - WIND_CHANCE;
  let elements: number;
  let skull: number;
  if (boardMultiplier(fill) <= 0) {
    const firstSection = ELEMENT_ORDER.reduce((sum, el) => sum + ELEMENT_WEIGHT[el] * RINGS[el].ladder[0], 0);
    elements = (returnToPlayer * notWind) / firstSection;
    skull = notWind - elements;
  } else {
    const gain = ELEMENT_ORDER.reduce((sum, el) => sum + ELEMENT_WEIGHT[el] * gainOnHit(el, fill[FILL_KEY[el]]), 0);
    const ratio = gain / skullLoss(fill);
    elements = notWind / (1 + ratio);
    skull = elements * ratio;
  }
  return {
    WATER: elements * ELEMENT_WEIGHT.WATER,
    EARTH: elements * ELEMENT_WEIGHT.EARTH,
    FIRE: elements * ELEMENT_WEIGHT.FIRE,
    SKULL: skull,
    WIND: WIND_CHANCE,
  };
}

const SYMBOL_ORDER: VortexSymbol[] = ["WATER", "EARTH", "FIRE", "SKULL", "WIND"];

/** The symbol a roll in [0, 1) lands on this board: Water, Earth, Fire, Skull, then Wind. */
export function symbolFor(roll: number, fill: Fill, returnToPlayer = rtp()): VortexSymbol {
  const chances = spinChances(fill, returnToPlayer);
  let edge = 0;
  for (const symbol of SYMBOL_ORDER) {
    edge += chances[symbol];
    if (roll < edge) return symbol;
  }
  return "WIND";
}

/** What landing `symbol` does to the board. `instant` (a multiple of the bet)
 * is paid at once; `premium` is the Fire bonus's pick. */
export function applySymbol(fill: Fill, symbol: VortexSymbol, premiumRoll: number): { fill: Fill; instant: number; premium: number | null } {
  const next = { ...fill };
  if (symbol === "WIND") return { fill: next, instant: 0, premium: null };
  if (symbol === "SKULL") {
    for (const el of ELEMENT_ORDER) next[FILL_KEY[el]] = Math.max(0, next[FILL_KEY[el]] - 1);
    return { fill: next, instant: 0, premium: null };
  }
  const key = FILL_KEY[symbol];
  const { ladder, bonus } = RINGS[symbol];
  if (next[key] < ladder.length) {
    next[key] += 1;
    return { fill: next, instant: 0, premium: null };
  }
  if (symbol !== "FIRE") return { fill: next, instant: bonus, premium: null };
  const premium = FIRE_PREMIUMS[Math.min(FIRE_PREMIUMS.length - 1, Math.floor(premiumRoll * FIRE_PREMIUMS.length))];
  next.fire = 0;
  return { fill: next, instant: ladder[ladder.length - 1] + premium, premium };
}

/** PART PAYOUT: every ring with two or more sections pays the step between
 * its last two and moves back one. Null when no ring has two. */
export function partPayout(fill: Fill): { fill: Fill; multiplier: number } | null {
  const next = { ...fill };
  let multiplier = 0;
  for (const el of ELEMENT_ORDER) {
    const key = FILL_KEY[el];
    if (next[key] >= 2) {
      multiplier += lossOnSkull(el, next[key]);
      next[key] -= 1;
    }
  }
  return multiplier > 0 ? { fill: next, multiplier } : null;
}

const EMPTY_BOARD: Fill = { water: 0, earth: 0, fire: 0 };

function percentages(chances: Chances): Chances {
  const pct = (n: number) => Math.round(n * 10000) / 100;
  return { WATER: pct(chances.WATER), EARTH: pct(chances.EARTH), FIRE: pct(chances.FIRE), SKULL: pct(chances.SKULL), WIND: pct(chances.WIND) };
}

export function getVortexConfig() {
  const start = percentages(spinChances(EMPTY_BOARD));
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(rtp() * 100),
    maxSpins: MAX_SPINS,
    /** The first spin of a round (the bet is taken on it). */
    startChances: start,
    windChancePercent: start.WIND,
    skullChancePercent: start.SKULL,
    firePremiums: FIRE_PREMIUMS,
    rings: ELEMENT_ORDER.map((element) => {
      const { ladder, bonus } = RINGS[element];
      // `chances` is for app 1.0.78, which lists one per section: the first-spin chance.
      return { element, ladder, bonus, chances: Array.from({ length: ladder.length + 1 }, () => start[element]) };
    }),
  };
}

type VortexRoundRow = Awaited<ReturnType<typeof prisma.vortexRound.findUniqueOrThrow>>;

/** Rounds of this game. Rounds of the wheel game it replaced are version 1
 * (see "the old game" below). */
const VERSION = 2;

/** The serverSeed is the player's live fairness seed (revealed only when
 * they rotate it), so it never leaves the server with a round. The event
 * list stays behind too: it can be long and only the history shows it.
 * `nextChances` is what the next spin can land (a new round's, once this one ended). */
function toPublicRound(round: VortexRoundRow) {
  const { serverSeed: _hidden, segments: _events, ...rest } = round;
  const board = round.status === "PENDING" ? { water: round.water, earth: round.earth, fire: round.fire } : EMPTY_BOARD;
  return { ...rest, nextChances: percentages(spinChances(board)) };
}

const ROUND_CHANGED = "This round was updated by another request. Please try again.";

/** Updates the round only if it is still exactly as read, so two requests
 * can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: VortexRoundRow, data: Prisma.VortexRoundUpdateManyMutationInput) {
  const claimed = await tx.vortexRound.updateMany({
    where: { id: round.id, status: "PENDING", spins: round.spins, payout: round.payout, water: round.water, earth: round.earth, fire: round.fire },
    data,
  });
  if (claimed.count === 0) throw new ApiError(409, ROUND_CHANGED);
  return tx.vortexRound.findUniqueOrThrow({ where: { id: round.id } });
}

/** Pays into the wallet (if there is anything to pay) and returns the balance after it. */
async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number): Promise<number> {
  if (payout <= 0) return Number((await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance);
  const wallet = await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
  return Number(wallet.balance);
}

/** Everything on one player's board happens one request at a time. */
async function lockWallet(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
}

function pendingRound(db: Prisma.TransactionClient, userId: string) {
  return db.vortexRound.findFirst({ where: { userId, status: "PENDING", version: VERSION } });
}

/** Takes one bet from the wallet (same locked-bonus wagering progress as the other games). */
async function takeStake(tx: Prisma.TransactionClient, userId: string, stake: number) {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  const debited = await tx.wallet.updateMany({
    where: { userId, balance: { gte: stake } },
    data: { balance: { decrement: stake } },
  });
  if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
  if (Number(wallet.lockedBonus) > 0) {
    const newProgress = Number(wallet.wageringProgress) + stake;
    await tx.wallet.update({
      where: { userId },
      data:
        newProgress >= Number(wallet.wageringRequired)
          ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 }
          : { wageringProgress: { increment: stake } },
    });
  }
  await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
}

/** Spin `spin` of a round; `kind` keeps the bonus pick apart from the symbol. */
function spinRoll(round: Pick<VortexRoundRow, "serverSeed" | "clientSeed" | "nonce">, spin: number, kind: "vortex" | "vortex-bonus"): number {
  return fairGameFloat(round.serverSeed, round.clientSeed, kind, round.nonce * 1000 + spin);
}

/**
 * One spin. With no round in play it starts one and takes the bet; in a
 * round every spin is free. It lands a symbol and pays what it wins at once.
 * The round ends by itself when a Skull leaves the board empty (CRASH), when
 * the Fire bonus leaves it empty (BONUS), at the payout limit, or after
 * MAX_SPINS (the last two pay what is on the board).
 */
export async function spinVortex(userId: string, stake: number) {
  if (Math.abs(stake * 100 - Math.round(stake * 100)) > 1e-6) throw new ApiError(400, "Bet can have at most two decimal places.");
  await assertCanTransact(userId);
  // A new round needs the player's next nonce, which is taken outside the transaction.
  const seeds = (await pendingRound(prisma, userId)) ? null : await nextRoundSeedMaterial(userId);

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    let round = await pendingRound(tx, userId);
    if (!round) {
      if (!seeds) throw new ApiError(409, ROUND_CHANGED);
      if (stake < env.games.minStake || stake > env.games.maxStake) {
        throw new ApiError(400, `Bet must be between ${env.games.minStake} and ${env.games.maxStake}.`);
      }
      // A round of the old wheel game still open is closed by /current first.
      if (await tx.vortexRound.findFirst({ where: { userId, status: "PENDING" } })) {
        throw new ApiError(400, "Finish your earlier round first: reopen Vortex.");
      }
      round = await tx.vortexRound.create({ data: { userId, stake, totalStake: stake, version: VERSION, ...seeds, segments: [] } });
      await takeStake(tx, userId, stake);
    }
    const bet = Number(round.stake);

    const before: Fill = { water: round.water, earth: round.earth, fire: round.fire };
    const symbol = symbolFor(spinRoll(round, round.spins, "vortex"), before);
    const { fill, instant, premium } = applySymbol(before, symbol, spinRoll(round, round.spins, "vortex-bonus"));
    const spins = round.spins + 1;
    const multiplier = boardMultiplier(fill);

    // The most this round may still pay.
    const room = Math.max(0, env.games.maxPayout - Number(round.payout));
    const instantPaid = Math.min(winAmount(bet, instant), room);
    const boardValue = winAmount(bet, multiplier);
    const atLimit = instantPaid + boardValue >= room;
    // Paid by the round ending itself with sections still on the board.
    const cashedOut = atLimit || (spins >= MAX_SPINS && multiplier > 0) ? round2(Math.min(boardValue, room - instantPaid)) : 0;
    // Wind on an empty board keeps the round (and its free spin) going.
    const cleared = multiplier === 0 && symbol !== "WIND";
    const endReason = atLimit
      ? "MAX_PAYOUT"
      : cleared && symbol === "SKULL"
        ? "CRASH"
        : cleared
          ? "BONUS"
          : spins >= MAX_SPINS
            ? "SPIN_LIMIT"
            : null;
    const payout = round2(Number(round.payout) + instantPaid + cashedOut);

    const updated = await claimRound(tx, round, {
      ...fill,
      spins,
      segments: { push: EVENT_CODE[symbol] },
      multiplier,
      payout,
      ...(endReason ? ended(payout, endReason) : {}),
    });
    const balance = await creditPayout(tx, userId, round2(instantPaid + cashedOut));
    return { round: toPublicRound(updated), symbol, before, instant: instantPaid, premium, cashedOut, balance };
  });
}

/** The fields that close a round: won if it paid anything at all. */
function ended(payout: number, endReason: string) {
  const status: "WON" | "LOST" = payout > 0 ? "WON" : "LOST";
  return { status, endReason, settledAt: new Date() };
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.vortexRound.findUnique({ where: { id: roundId } });
  if (!round || round.version !== VERSION) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This round has already ended.");
  return round;
}

/** CASH OUT: pays all three rings and ends the round. */
export async function cashOutVortex(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const round = await loadActiveRound(tx, userId, roundId);
    const room = Math.max(0, env.games.maxPayout - Number(round.payout));
    const paid = Math.min(winAmount(Number(round.stake), boardMultiplier(round)), room);
    const payout = round2(Number(round.payout) + paid);
    const updated = await claimRound(tx, round, { payout, ...ended(payout, "CASHOUT") });
    const balance = await creditPayout(tx, userId, paid);
    return { round: toPublicRound(updated), paid, balance };
  });
}

/** PART PAYOUT: see partPayout(). The round goes on (unless that reached the payout limit). */
export async function partPayoutVortex(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const round = await loadActiveRound(tx, userId, roundId);
    const part = partPayout(round);
    if (!part) throw new ApiError(400, "Part payout needs two or more sections on a ring.");
    const room = Math.max(0, env.games.maxPayout - Number(round.payout));
    const paid = Math.min(winAmount(Number(round.stake), part.multiplier), room);
    const payout = round2(Number(round.payout) + paid);
    const updated = await claimRound(tx, round, {
      ...part.fill,
      segments: { push: EVENT_CODE.PART_PAYOUT },
      multiplier: boardMultiplier(part.fill),
      payout,
      // Nothing more can be paid once the round is at the payout limit.
      ...(paid >= room ? ended(payout, "MAX_PAYOUT") : {}),
    });
    const balance = await creditPayout(tx, userId, paid);
    return { round: toPublicRound(updated), paid, balance };
  });
}

/** The round in play, if any. A round of the old wheel game still open is
 * cashed out first; `legacyPayout` is what that paid. */
export async function getMyCurrentVortex(userId: string) {
  const old = await getMyCurrentLegacyRound(userId);
  let legacyPayout = 0;
  if (old) {
    try {
      legacyPayout = Number((await cashOutLegacyRound(userId, old.id)).payout);
    } catch {
      // Closed by another request in the meantime.
    }
  }
  const round = await pendingRound(prisma, userId);
  return { round: round ? toPublicRound(round) : null, legacyPayout };
}

export async function getMyVortexHistory(userId: string, limit = 30) {
  const rounds = await prisma.vortexRound.findMany({
    where: { userId, version: VERSION, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}

// ---------- the old game ----------
//
// Until app 1.0.77 Vortex was a wheel: one stake, a multiplier that grew with
// every element landed, and a losing "vortex" segment. Those apps still call
// the old routes: they get the old settings (so the screen opens), can see
// and cash out a round they had open, and are asked to update to play.

const LEGACY_WHEEL = ["WATER", "EARTH", "WATER", "CRASH", "WATER", "FIRE", "WATER", "EARTH", "CRASH", "WATER", "EARTH", "WATER", "CRASH", "WATER", "EARTH", "CRASH", "FIRE", "WATER", "EARTH", "CRASH"];
const LEGACY_ELEMENTS = [
  { element: "WATER", factor: 1.2, sections: 10 },
  { element: "EARTH", factor: 1.4, sections: 8 },
  { element: "FIRE", factor: 1.7, sections: 5 },
];

export function getLegacyVortexConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(rtp() * 100),
    wheel: LEGACY_WHEEL,
    elements: LEGACY_ELEMENTS.map(({ element, factor, sections }) => ({
      element,
      factor,
      sections,
      chancePercent: (LEGACY_WHEEL.filter((s) => s === element).length / LEGACY_WHEEL.length) * 100,
      ladder: Array.from({ length: sections + 1 }, (_, k) => floor2(factor ** k)),
    })),
    crashChancePercent: (LEGACY_WHEEL.filter((s) => s === "CRASH").length / LEGACY_WHEEL.length) * 100,
  };
}

function toLegacyRound(round: VortexRoundRow) {
  const { serverSeed: _hidden, ...rest } = round;
  return rest;
}

export async function getMyCurrentLegacyRound(userId: string) {
  const round = await prisma.vortexRound.findFirst({ where: { userId, status: "PENDING", version: 1 } });
  return round ? toLegacyRound(round) : null;
}

export async function getMyLegacyVortexHistory(userId: string, limit = 30) {
  const rounds = await prisma.vortexRound.findMany({
    where: { userId, version: 1, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toLegacyRound);
}

/** Pays an open round of the old game what it stood at (stake x multiplier). */
export async function cashOutLegacyRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const round = await tx.vortexRound.findUnique({ where: { id: roundId } });
    if (!round || round.version !== 1) throw new ApiError(404, "Round not found.");
    if (round.userId !== userId) throw new ApiError(403, "Not your round.");
    if (round.status !== "PENDING") throw new ApiError(400, "This round has already ended.");
    const payout = Math.min(floor2(Number(round.stake) * Number(round.multiplier)), env.games.maxPayout);
    const updated = await claimRound(tx, round, { payout, ...ended(payout, "CASHOUT") });
    await creditPayout(tx, userId, payout);
    return toLegacyRound(updated);
  });
}

export const LEGACY_UPDATE_MESSAGE = "Vortex is a new game now. Please update NovaPlay (or refresh this page) to play it.";

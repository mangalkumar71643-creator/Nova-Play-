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
 * The board: three rings, one per element. Every spin costs the bet and
 * lands one symbol —
 *   Water / Earth / Fire  fills the next section of its ring;
 *   Wind                  does nothing;
 *   Skull                 takes one section off every ring.
 * A ring is worth its last filled section's multiplier x the bet. CASH OUT
 * pays all three rings and clears the board; PART PAYOUT pays, for each ring
 * with two or more sections, the step between its last two sections and
 * moves that ring back one.
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

const SKULL_CHANCE = 0.08;
/** How the return to player is split between the rings. */
const RTP_SHARE: Record<VortexElement, number> = { WATER: 0.475, EARTH: 0.325, FIRE: 0.2 };
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

/**
 * The chance that a spin lands `element` while its ring has `level` sections.
 *
 * It is set so that each ring's value grows by the same expected amount on
 * every spin, whatever is on the board:
 *     chance x gainOnHit - SKULL_CHANCE x lossOnSkull = rtp x RTP_SHARE
 * The three shares add up to 1, so one spin always returns rtp x the bet on
 * average — in board value or paid at once. Cashing out only turns board
 * value into money at face value, so no way of playing (when to cash out,
 * part payouts, chasing a ring) returns more than rtp; rounding down and the
 * payout limit only lower it.
 */
export function hitChance(element: VortexElement, level: number, returnToPlayer = rtp()): number {
  return (returnToPlayer * RTP_SHARE[element] + SKULL_CHANCE * lossOnSkull(element, level)) / gainOnHit(element, level);
}

/** The symbol a roll in [0, 1) lands on this board: Water, Earth, Fire, Skull, then Wind. */
export function symbolFor(roll: number, fill: Fill, returnToPlayer = rtp()): VortexSymbol {
  let edge = 0;
  for (const el of ELEMENT_ORDER) {
    edge += hitChance(el, fill[FILL_KEY[el]], returnToPlayer);
    if (roll < edge) return el;
  }
  return roll < edge + SKULL_CHANCE ? "SKULL" : "WIND";
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

export function getVortexConfig() {
  const pct = (n: number) => Math.round(n * 10000) / 100;
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(rtp() * 100),
    maxSpins: MAX_SPINS,
    skullChancePercent: pct(SKULL_CHANCE),
    firePremiums: FIRE_PREMIUMS,
    rings: ELEMENT_ORDER.map((element) => {
      const { ladder, bonus } = RINGS[element];
      return {
        element,
        ladder,
        bonus,
        // Chance of this element by how many of its sections are filled (0 … full).
        chances: Array.from({ length: ladder.length + 1 }, (_, level) => pct(hitChance(element, level))),
      };
    }),
  };
}

type VortexRoundRow = Awaited<ReturnType<typeof prisma.vortexRound.findUniqueOrThrow>>;

/** Rounds of this game. Rounds of the wheel game it replaced are version 1
 * (see "the old game" below). */
const VERSION = 2;

/** The serverSeed is the player's live fairness seed (revealed only when
 * they rotate it), so it never leaves the server with a round. The event
 * list stays behind too: it can be long and only the history shows it. */
function toPublicRound(round: VortexRoundRow) {
  const { serverSeed: _hidden, segments: _events, ...rest } = round;
  return rest;
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
 * One spin: takes the bet (starting a round if the board is clear), lands a
 * symbol and pays what it wins at once. The round ends by itself when the
 * board is clear again, at the payout limit, or after MAX_SPINS.
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
      round = await tx.vortexRound.create({ data: { userId, stake, version: VERSION, ...seeds, segments: [] } });
    }
    const bet = Number(round.stake);
    await takeStake(tx, userId, bet);

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
    const endReason = atLimit ? "MAX_PAYOUT" : multiplier === 0 ? "CLEAR" : spins >= MAX_SPINS ? "SPIN_LIMIT" : null;
    const payout = round2(Number(round.payout) + instantPaid + cashedOut);

    const updated = await claimRound(tx, round, {
      ...fill,
      spins,
      totalStake: { increment: bet },
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

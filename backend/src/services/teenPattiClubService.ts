import { Prisma } from "@prisma/client";
import { randomInt, randomUUID } from "crypto";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import {
  act,
  ActionKind,
  CLUB,
  ClubError,
  expire,
  HandState,
  HandView,
  leaveHand,
  MIN_RAKE_BPS,
  newHand,
  nextDeadline,
  playerIndex,
  toPaise,
  viewHand,
} from "./teenPattiClubEngine";
import { HAND_NAMES } from "./teenPattiService";

/**
 * Teen Patti Club: real Teen Patti for 2 or 3 players. The rules of a hand are in teenPattiClubEngine.ts; this file is the
 * tables around it: who sits where, the wallets, the clocks and what each player is shown.
 *
 * HOW IT RUNS ON A SERVER WITHOUT A CLOCK
 *  - The backend is serverless: nothing runs between requests. The app polls its table about once a second, and every
 *    request first plays out whatever has run out of time (a turn nobody took, a countdown, a result that has been shown
 *    long enough), dated at its own deadline, then does what was asked. A table nobody is looking at is settled by the next
 *    lobby visit (sweepDueClubTables), and a player's own table is always settled before they see it.
 *  - A table is one row. Every change takes that row's lock, so two players' moves can never run at once.
 *
 * MONEY
 *  - The boot and every bet are taken from the wallet at the moment they are made (GAME_STAKE), in the same database
 *    transaction that records the move; the pot is paid out when the hand ends (GAME_PAYOUT) minus the house's rake, which is
 *    at least 5% of the pot (teenPattiClubEngine.finish). The report reads TeenPattiClubResult, kept up to date through the hand.
 *  - A player who stops answering packs when their turn runs out; two hands in a row like that and they are taken off the table.
 *
 * WHO SEES WHAT
 *  - The state in the database has every card. A player is only ever sent viewHand(): their own cards once they look, the
 *    cards a side show showed them, cards turned over at the end - and the seed only after the hand.
 */

type Tx = Prisma.TransactionClient;
type Phase = "WAITING" | "STARTING" | "PLAYING" | "RESULT";

interface TableState {
  phase: Phase;
  /** STARTING: when the cards are dealt. RESULT: when the next hand is dealt. */
  startsAt: number | null;
  handId: string | null;
  /** The hand being played, or the one just finished (while its result is shown). */
  hand: HandState | null;
  dealerSeat: number | null;
  /** Hands dealt at this table so far. */
  handNo: number;
  /** A private table started by its host with fewer players than seats. */
  startWithFewer: boolean;
}

type SeatRow = Prisma.TeenPattiClubSeatGetPayload<object>;
type TableRow = Prisma.TeenPattiClubTableGetPayload<{ include: { seatRows: true } }>;

/** A player who has not polled for this long is not at the table any more (unless a hand is being played: the clock handles them). */
const PRESENCE_MS = 25_000;
/** How often a waiting table looks for players who went away. */
const WAIT_TICK_MS = 10_000;
/** The seat's "last seen" is written at most this often. */
const TOUCH_MS = 4_000;
const MAX_IDLE_HANDS = 2;
const TX = { maxWait: 10_000, timeout: 25_000 };

export function clubRakeBps(): number {
  return Math.max(MIN_RAKE_BPS, Math.round((env.games.teenPattiClubRake || 0) * 10000));
}

export function getClubConfig() {
  return {
    boots: CLUB.BOOTS.map((boot) => ({
      boot,
      minBalance: boot * CLUB.MIN_SIT_X,
      maxStake: boot * CLUB.MAX_STAKE_X,
      maxBet: boot * CLUB.MAX_STAKE_X * 2,
      potLimit: boot * CLUB.POT_LIMIT_X,
    })),
    seats: CLUB.SEATS,
    rakePercent: clubRakeBps() / 100,
    turnSeconds: CLUB.TURN_MS / 1000,
    sideShowSeconds: CLUB.SIDE_SHOW_MS / 1000,
    maxStakeTimes: CLUB.MAX_STAKE_X,
    potLimitTimes: CLUB.POT_LIMIT_X,
    minBalanceTimes: CLUB.MIN_SIT_X,
    handNames: HAND_NAMES.slice(1),
  };
}

const emptyState = (): TableState => ({ phase: "WAITING", startsAt: null, handId: null, hand: null, dealerSeat: null, handNo: 0, startWithFewer: false });
const stateOf = (row: { state: Prisma.JsonValue }) => row.state as unknown as TableState;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** What other players see: a name, never the phone digits the sign-up put in the last name. */
function publicName(u: { firstName: string; lastName: string; uid: number | null }): string {
  const first = (u.firstName ?? "").trim();
  if (first && !["player", "user"].includes(first.toLowerCase())) {
    const last = (u.lastName ?? "").trim();
    return `${first.slice(0, 12)}${last ? ` ${last[0].toUpperCase()}.` : ""}`;
  }
  return `Player ${u.uid ?? ""}`.trim();
}

function fail(e: unknown): never {
  if (e instanceof ClubError) throw new ApiError(e.status, e.message);
  throw e;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rows and the lock

async function lockTable(tx: Tx, id: string): Promise<TableRow | null> {
  const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "TeenPattiClubTable" WHERE id = ${id} FOR UPDATE`;
  if (found.length === 0) return null;
  return tx.teenPattiClubTable.findUnique({ where: { id }, include: { seatRows: true } });
}

const seatsOf = (tx: Tx, tableId: string) => tx.teenPattiClubSeat.findMany({ where: { tableId }, orderBy: { seat: "asc" } });

/** The wallets of the players a hand touches, in a fixed order so two tables can never wait on each other. */
async function lockWallets(tx: Tx, ids: string[]) {
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" IN (${Prisma.join([...ids].sort())}) ORDER BY "userId" FOR UPDATE`;
}

function dueFor(st: TableState, now: number, humans: number): Date | null {
  switch (st.phase) {
    case "WAITING":
      return humans > 0 ? new Date(now + WAIT_TICK_MS) : null;
    case "STARTING":
    case "RESULT":
      return st.startsAt === null ? null : new Date(st.startsAt);
    case "PLAYING": {
      const t = st.hand ? nextDeadline(st.hand) : null;
      return t === null ? null : new Date(t);
    }
  }
}

async function saveTable(tx: Tx, row: TableRow, st: TableState, now: number, humans: number, extra: Prisma.TeenPattiClubTableUpdateInput = {}) {
  await tx.teenPattiClubTable.update({
    where: { id: row.id },
    data: { state: st as unknown as Prisma.InputJsonValue, phase: st.phase, dueAt: dueFor(st, now, humans), version: { increment: 1 }, handsPlayed: st.handNo, ...extra },
  });
}

async function reload(tx: Tx, id: string) {
  return tx.teenPattiClubTable.findUnique({ where: { id }, include: { seatRows: true } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Money

/** Takes a bet from the wallet: conditional, so two requests can never overdraw it. */
async function takeMoney(tx: Tx, userId: string, paise: number) {
  const amount = paise / 100;
  const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
  if (debited.count === 0) throw new ApiError(400, "Not enough balance for this move - you can still pack.");
  await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount, status: "COMPLETED" } });
}

/** The hand is over: pays the winner(s), counts the wagering, writes the result rows and the record of the hand. */
async function finalizeHand(tx: Tx, row: TableRow, st: TableState) {
  const h = st.hand!;
  const r = h.result!;
  const ids = h.players.map((p) => p.userId);
  await lockWallets(tx, ids);
  const wallets = await tx.wallet.findMany({ where: { userId: { in: ids } } });
  for (const p of h.players) {
    const payout = (r.payouts[p.userId] ?? 0) / 100;
    const invested = p.invested / 100;
    const w = wallets.find((x) => x.userId === p.userId);
    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Wagering counts once the hand is decided, like in the other games.
    if (w && Number(w.lockedBonus) > 0) {
      const progress = Number(w.wageringProgress) + invested;
      if (progress >= Number(w.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: invested };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId: p.userId }, data });
    if (payout > 0) await tx.transaction.create({ data: { userId: p.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    const outcome = payout > 0 ? "WON" : p.left ? "LEFT" : p.packed ? "PACKED" : "LOST";
    await tx.teenPattiClubResult.updateMany({ where: { handId: st.handId!, userId: p.userId }, data: { invested, payout, outcome } });
  }
  await tx.teenPattiClubHand.create({
    data: {
      id: st.handId!,
      tableId: row.id,
      no: h.no,
      boot: Number(row.boot),
      pot: h.pot / 100,
      rake: r.rake / 100,
      endedBy: r.endedBy,
      players: h.players.length,
      detail: {
        dealer: h.dealer,
        shown: r.shown,
        asker: r.asker,
        players: h.players.map((p) => ({
          userId: p.userId,
          seat: p.seat,
          name: p.name,
          cards: p.cards,
          seen: p.seen,
          packed: p.packed,
          left: p.left,
          timedOut: p.timedOut,
          invested: p.invested / 100,
          payout: (r.payouts[p.userId] ?? 0) / 100,
        })),
      },
      seed: h.seed,
      seedHash: h.seedHash,
    },
  });
  // Players who let a hand run out of time are counted; a player who moved starts again from zero.
  for (const s of await seatsOf(tx, row.id)) {
    const p = h.players.find((x) => x.userId === s.userId);
    if (p) await tx.teenPattiClubSeat.update({ where: { id: s.id }, data: { idleHands: p.timedOut ? s.idleHands + 1 : 0 } });
  }
  const endedAt = h.log.length ? h.log[h.log.length - 1].at : Date.now();
  st.phase = "RESULT";
  st.startsAt = endedAt + CLUB.RESULT_MS;
}

// ---------------------------------------------------------------------------------------------------------------------
// The clock

/**
 * Plays out everything that is due at `now`: a turn, a side show answer, a result that has been shown, a countdown.
 * Returns the table as it is afterwards, or null if it ended (nobody left).
 */
async function processTable(tx: Tx, row: TableRow, now: number): Promise<TableRow | null> {
  const st = stateOf(row);
  let changed = false;
  let rearm = false;
  for (let guard = 0; guard < 30; guard++) {
    if (st.phase === "PLAYING" && st.hand) {
      if (!st.hand.over) {
        const due = nextDeadline(st.hand);
        if (due === null || now < due) break;
        const copy = clone(st.hand);
        expire(copy, now);
        st.hand = copy;
        changed = true;
        if (!copy.over) break;
      }
      await finalizeHand(tx, row, st);
      changed = true;
      continue;
    }
    if (st.phase === "STARTING" || st.phase === "RESULT") {
      if (st.startsAt !== null && now < st.startsAt) break;
      const dealt = await startHand(tx, row, st, now);
      changed = true;
      if (!dealt) break;
      continue;
    }
    // WAITING: players who went away are taken off.
    const stale = (await seatsOf(tx, row.id)).filter((s) => now - s.lastSeenAt.getTime() > PRESENCE_MS);
    if (stale.length > 0) {
      await tx.teenPattiClubSeat.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      changed = true;
    } else {
      rearm = true;
    }
    break;
  }
  if (!changed) {
    if (rearm) await tx.teenPattiClubTable.update({ where: { id: row.id }, data: { dueAt: new Date(now + WAIT_TICK_MS) } });
    return row;
  }
  const humans = (await seatsOf(tx, row.id)).length;
  if (humans === 0 && st.phase !== "PLAYING") {
    await tx.teenPattiClubTable.delete({ where: { id: row.id } });
    return null;
  }
  await saveTable(tx, row, st, now, humans);
  return reload(tx, row.id);
}

/**
 * Deals the next hand, if there are enough players who can play it. Players who went away, let two hands run out of time,
 * cannot play (banned, self-excluded) or no longer have the table's minimum balance are taken off first.
 * Returns false (and leaves the table waiting) when there is no hand to deal.
 */
async function startHand(tx: Tx, row: TableRow, st: TableState, now: number): Promise<boolean> {
  const boot = Number(row.boot);
  const humans = await seatsOf(tx, row.id);
  const ids = humans.map((s) => s.userId);
  await lockWallets(tx, ids);
  const [wallets, users] = await Promise.all([
    tx.wallet.findMany({ where: { userId: { in: ids } }, select: { userId: true, balance: true } }),
    tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, isBanned: true, isSelfExcluded: true, selfExclusionUntil: true } }),
  ]);
  const keep: SeatRow[] = [];
  const drop: SeatRow[] = [];
  for (const s of humans) {
    const u = users.find((x) => x.id === s.userId);
    const w = wallets.find((x) => x.userId === s.userId);
    const gone = now - s.lastSeenAt.getTime() > PRESENCE_MS;
    const idle = s.idleHands >= MAX_IDLE_HANDS;
    const excluded = !!u?.isSelfExcluded && (!u.selfExclusionUntil || u.selfExclusionUntil.getTime() > now);
    const broke = !w || Number(w.balance) < boot * CLUB.MIN_SIT_X;
    (gone || idle || !u || u.isBanned || excluded || broke ? drop : keep).push(s);
  }
  if (drop.length > 0) await tx.teenPattiClubSeat.deleteMany({ where: { id: { in: drop.map((d) => d.id) } } });
  const needFull = st.handNo === 0 && !st.startWithFewer;
  if (needFull ? keep.length !== row.seats : keep.length < 2) {
    st.phase = "WAITING";
    st.startsAt = null;
    st.hand = null;
    st.handId = null;
    return false;
  }
  const hand = newHand({
    no: st.handNo + 1,
    boot: toPaise(boot),
    players: keep.map((s) => ({ userId: s.userId, seat: s.seat, name: s.name, uid: s.uid })),
    lastDealerSeat: st.dealerSeat,
    now,
    rakeBps: clubRakeBps(),
  });
  const handId = randomUUID();
  for (const s of keep) {
    await takeMoney(tx, s.userId, hand.boot);
    await tx.teenPattiClubResult.create({ data: { handId, userId: s.userId, invested: boot } });
  }
  st.phase = "PLAYING";
  st.startsAt = null;
  st.hand = hand;
  st.handId = handId;
  st.handNo += 1;
  st.dealerSeat = hand.players[hand.dealer].seat;
  st.startWithFewer = false;
  return true;
}

/** Runs `fn` on a table under its lock, after what is due on it has been played out. */
async function withTable<T>(tableId: string, fn: (tx: Tx, row: TableRow | null, now: number) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockTable(tx, tableId);
    const now = Date.now();
    if (!locked) return fn(tx, null, now);
    return fn(tx, await processTable(tx, locked, now), now);
  }, TX);
}

/**
 * Plays out what is due on the player's own table (a turn that ran out, a hand that has ended) before their wallet is read, so the
 * money of a hand nobody was looking at (the app was closed in the middle of it) is settled as soon as the player is back.
 */
export async function settleMyClubTable(userId: string) {
  const seat = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (!seat) return;
  const t = await prisma.teenPattiClubTable.findUnique({ where: { id: seat.tableId }, select: { dueAt: true } });
  if (t?.dueAt && t.dueAt.getTime() <= Date.now()) await withTable(seat.tableId, async () => null);
}

/** Settles a few tables whose clock has run out and that nobody is looking at (nothing else runs between requests). */
export async function sweepDueClubTables(limit = 4) {
  const due = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "TeenPattiClubTable" WHERE "dueAt" IS NOT NULL AND "dueAt" <= now() ORDER BY "dueAt" LIMIT ${limit}`;
  for (const t of due) {
    try {
      await withTable(t.id, async () => null);
    } catch (e) {
      console.error("[teen-patti-club] sweep failed", t.id, e);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// What a player is shown

const R = (paise: number) => paise / 100;

/**
 * The hand as the app gets it, in rupees. A player who has left the table is marked `left` (also at the end of a hand), because
 * their seat may already be somebody else's: the app draws only the players who are still there.
 */
function apiHand(v: HandView, seated: Set<string>, h: HandState) {
  const a = v.you?.actions;
  return {
    ...v,
    boot: R(v.boot),
    pot: R(v.pot),
    stake: R(v.stake),
    maxStake: R(v.maxStake),
    potLimit: R(v.potLimit),
    rakePercent: v.rakeBps / 100,
    players: v.players.map((p, i) => ({ ...p, invested: R(p.invested), left: p.left || !seated.has(h.players[i].userId) })),
    log: v.log.map((e) => (e.amount === undefined ? e : { ...e, amount: R(e.amount) })),
    result: v.result && { ...v.result, pot: R(v.result.pot), rake: R(v.result.rake), payouts: v.result.payouts.map((x) => ({ seat: x.seat, amount: R(x.amount) })) },
    you:
      v.you && a
        ? {
            seat: v.you.seat,
            actions: {
              ...a,
              chaal: a.chaal === null ? null : R(a.chaal),
              raise: a.raise && { cost: R(a.raise.cost), stake: R(a.raise.stake) },
              show: a.show === null ? null : R(a.show),
            },
          }
        : null,
  };
}

function buildView(row: TableRow, userId: string, balance: number, now: number) {
  const st = stateOf(row);
  const h = st.hand;
  const mine = row.seatRows.find((s) => s.userId === userId);
  const humans = row.seatRows.length;
  const seatsInfo = Array.from({ length: row.seats }, (_, n) => {
    const s = row.seatRows.find((x) => x.seat === n);
    if (!s) return { seat: n, empty: true as const };
    const inHand = !!h && h.players.some((p) => p.userId === s.userId);
    return { seat: n, empty: false as const, name: s.name, uid: s.uid, you: s.userId === userId, inHand, away: now - s.lastSeenAt.getTime() > PRESENCE_MS };
  });
  const boot = Number(row.boot);
  return {
    id: row.id,
    boot,
    seats: row.seats,
    isPrivate: row.isPrivate,
    code: row.isPrivate ? row.code : null,
    host: row.hostId === userId,
    canStart: row.isPrivate && row.hostId === userId && st.phase === "WAITING" && st.handNo === 0 && humans >= 2 && humans < row.seats,
    phase: st.phase,
    version: row.version,
    now,
    startsAt: st.startsAt,
    handNo: st.handNo,
    rakePercent: (h?.rakeBps ?? clubRakeBps()) / 100,
    minBalance: boot * CLUB.MIN_SIT_X,
    maxStake: boot * CLUB.MAX_STAKE_X,
    potLimit: boot * CLUB.POT_LIMIT_X,
    turnSeconds: CLUB.TURN_MS / 1000,
    balance,
    you: mine ? mine.seat : null,
    seatsInfo,
    hand: h ? apiHand(viewHand(h, userId), new Set(row.seatRows.map((s) => s.userId)), h) : null,
  };
}

async function balanceOf(tx: Tx | typeof prisma, userId: string): Promise<number> {
  const w = await tx.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return w ? Number(w.balance) : 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// The lobby

export async function getClubLobby(userId: string) {
  await sweepDueClubTables();
  const now = Date.now();
  const rows = await prisma.$queryRaw<{ boot: number; seats: number; phase: string; fresh: boolean; players: bigint }[]>`
    SELECT t.boot::float AS boot, t.seats, t.phase, (t."handsPlayed" = 0) AS fresh,
           COUNT(s.id) FILTER (WHERE s."lastSeenAt" > now() - interval '25 seconds') AS players
    FROM "TeenPattiClubTable" t LEFT JOIN "TeenPattiClubSeat" s ON s."tableId" = t.id
    WHERE t."isPrivate" = false
    GROUP BY t.id`;
  const cfg = getClubConfig();
  const boots = cfg.boots.map((b) => ({
    ...b,
    sizes: CLUB.SEATS.map((seats) => {
      const here = rows.filter((r) => Number(r.boot) === b.boot && r.seats === seats);
      return {
        seats,
        /** Players sitting at a table that is still filling up. */
        waiting: here.filter((r) => r.fresh && (r.phase === "WAITING" || r.phase === "STARTING")).reduce((n, r) => n + Number(r.players), 0),
        playing: here.filter((r) => !(r.fresh && (r.phase === "WAITING" || r.phase === "STARTING"))).reduce((n, r) => n + Number(r.players), 0),
      };
    }),
  }));
  const seat = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, include: { table: { select: { id: true, boot: true, seats: true, phase: true, isPrivate: true } } } });
  const balance = await balanceOf(prisma, userId);
  return {
    now,
    balance,
    rakePercent: cfg.rakePercent,
    boots,
    online: rows.reduce((n, r) => n + Number(r.players), 0),
    mine: seat ? { tableId: seat.table.id, boot: Number(seat.table.boot), seats: seat.table.seats, phase: seat.table.phase, isPrivate: seat.table.isPrivate } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Sitting down and leaving

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(0, CODE_CHARS.length)]).join("");

async function playerFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true, uid: true } });
  return { name: publicName(user), uid: user.uid };
}

async function assertCanSit(userId: string, boot: number) {
  await assertCanTransact(userId);
  const balance = await balanceOf(prisma, userId);
  const need = boot * CLUB.MIN_SIT_X;
  if (balance < need) throw new ApiError(400, `You need at least ₹${need.toLocaleString("en-IN")} in your wallet to sit at a ₹${boot.toLocaleString("en-IN")} boot table.`);
}

/** Puts a player in the lowest free seat and starts the countdown when the table has what it needs. */
async function seatPlayer(tx: Tx, row: TableRow, who: { userId: string; name: string; uid: number | null }, now: number): Promise<TableRow> {
  const st = stateOf(row);
  const taken = new Set(row.seatRows.map((s) => s.seat));
  const free = Array.from({ length: row.seats }, (_, n) => n).find((n) => !taken.has(n));
  if (free === undefined) throw new ApiError(409, "That table is full.");
  await tx.teenPattiClubSeat.create({ data: { tableId: row.id, seat: free, userId: who.userId, name: who.name, uid: who.uid, lastSeenAt: new Date(now) } });
  const humans = row.seatRows.length + 1;
  if (st.phase === "WAITING") {
    const ready = st.handNo === 0 ? humans === row.seats : humans >= 2;
    if (ready) {
      st.phase = "STARTING";
      st.startsAt = now + CLUB.START_MS;
    }
  }
  await saveTable(tx, row, st, now, humans);
  return (await reload(tx, row.id))!;
}

async function viewAfter(tx: Tx, row: TableRow | null, userId: string, now: number) {
  if (!row) return { table: null, now };
  return { table: buildView(row, userId, await balanceOf(tx, userId), now), now };
}

/** Quick play: the first table of that boot and size with a free seat, or a new one. */
export async function joinClubTable(userId: string, boot: number, seats: number) {
  if (!CLUB.BOOTS.includes(boot) || !CLUB.SEATS.includes(seats)) throw new ApiError(400, "Pick one of the boot amounts and 2 or 3 players.");
  const existing = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (existing) return getMyClubTable(userId);
  await assertCanSit(userId, boot);
  const who = { userId, ...(await playerFor(userId)) };
  await sweepDueClubTables(2);
  try {
    return await prisma.$transaction(async (tx) => {
      const now = Date.now();
      // One player at a time per queue (boot and size): two who sit down at the same moment must find each other's table, not make one each.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`teen-patti-club:${boot}:${seats}`}))`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const found = await tx.$queryRaw<{ id: string }[]>`
          SELECT t.id FROM "TeenPattiClubTable" t
          WHERE t.boot = ${boot} AND t.seats = ${seats} AND t."isPrivate" = false
            AND (SELECT COUNT(*) FROM "TeenPattiClubSeat" s WHERE s."tableId" = t.id) < t.seats
          ORDER BY (t."handsPlayed" = 0) DESC, (SELECT COUNT(*) FROM "TeenPattiClubSeat" s WHERE s."tableId" = t.id) DESC, t."createdAt" ASC
          LIMIT 1
          FOR UPDATE OF t SKIP LOCKED`;
        if (found.length === 0) break;
        const locked = await lockTable(tx, found[0].id);
        if (!locked) continue;
        const row = await processTable(tx, locked, now);
        if (row && row.seatRows.length < row.seats) return viewAfter(tx, await seatPlayer(tx, row, who, now), userId, now);
      }
      const st = emptyState();
      const created = await tx.teenPattiClubTable.create({ data: { boot, seats, state: st as unknown as Prisma.InputJsonValue, phase: st.phase, dueAt: new Date(now + WAIT_TICK_MS) } });
      const row = (await lockTable(tx, created.id))!;
      return viewAfter(tx, await seatPlayer(tx, row, who, now), userId, now);
    }, TX);
  } catch (e) {
    return fail(e);
  }
}

/** A table for friends: made with a code to share; nobody else is matched with it. */
export async function createPrivateClubTable(userId: string, boot: number, seats: number) {
  if (!CLUB.BOOTS.includes(boot) || !CLUB.SEATS.includes(seats)) throw new ApiError(400, "Pick one of the boot amounts and 2 or 3 players.");
  const existing = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (existing) return getMyClubTable(userId);
  await assertCanSit(userId, boot);
  const who = { userId, ...(await playerFor(userId)) };
  return prisma.$transaction(async (tx) => {
    const now = Date.now();
    let code = makeCode();
    for (let i = 0; i < 6 && (await tx.teenPattiClubTable.findUnique({ where: { code }, select: { id: true } })); i++) code = makeCode();
    const st = emptyState();
    const created = await tx.teenPattiClubTable.create({ data: { boot, seats, isPrivate: true, code, hostId: userId, state: st as unknown as Prisma.InputJsonValue, phase: st.phase, dueAt: new Date(now + WAIT_TICK_MS) } });
    const row = (await lockTable(tx, created.id))!;
    return viewAfter(tx, await seatPlayer(tx, row, who, now), userId, now);
  }, TX);
}

export async function joinClubByCode(userId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const existing = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (existing) return getMyClubTable(userId);
  const table = await prisma.teenPattiClubTable.findUnique({ where: { code }, select: { id: true, boot: true } });
  if (!table) throw new ApiError(404, "No table has that code. Check it with your friend.");
  await assertCanSit(userId, Number(table.boot));
  const who = { userId, ...(await playerFor(userId)) };
  try {
    return await withTable(table.id, async (tx, row, now) => {
      if (!row) throw new ApiError(404, "That table has closed.");
      if (row.seatRows.length >= row.seats) throw new ApiError(409, "That table is full.");
      return viewAfter(tx, await seatPlayer(tx, row, who, now), userId, now);
    });
  } catch (e) {
    return fail(e);
  }
}

/** The host of a friends' table starts it with the players who are there (2 of 3). */
export async function startPrivateClubTable(userId: string) {
  const seat = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (!seat) throw new ApiError(404, "You are not at a table.");
  return withTable(seat.tableId, async (tx, row, now) => {
    if (!row) throw new ApiError(404, "That table has closed.");
    const st = stateOf(row);
    if (!row.isPrivate || row.hostId !== userId) throw new ApiError(403, "Only the host of a friends' table can start it.");
    const humans = row.seatRows.length;
    if (st.phase !== "WAITING" || st.handNo !== 0) throw new ApiError(400, "The table has already started.");
    if (humans < 2) throw new ApiError(400, "At least 2 players are needed to start.");
    st.startWithFewer = true;
    st.phase = "STARTING";
    st.startsAt = now + CLUB.START_MS;
    await saveTable(tx, row, st, now, humans);
    return viewAfter(tx, await reload(tx, row.id), userId, now);
  });
}

/** Gets up from the table. In the middle of a hand that is a pack: what the player put in stays in the pot. */
export async function leaveClubTable(userId: string) {
  const seat = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (!seat) return { left: true };
  await withTable(seat.tableId, async (tx, row, now) => {
    if (!row) return;
    const st = stateOf(row);
    const mine = row.seatRows.find((s) => s.userId === userId);
    if (!mine) return;
    if (st.phase === "PLAYING" && st.hand && !st.hand.over) {
      const idx = playerIndex(st.hand, userId);
      if (idx >= 0) {
        const copy = clone(st.hand);
        leaveHand(copy, idx, now);
        st.hand = copy;
        if (copy.over) await finalizeHand(tx, row, st);
      }
    }
    await tx.teenPattiClubSeat.delete({ where: { id: mine.id } });
    const humans = (await seatsOf(tx, row.id)).length;
    if (humans === 0 && st.phase !== "PLAYING") {
      await tx.teenPattiClubTable.delete({ where: { id: row.id } });
      return;
    }
    if ((st.phase === "STARTING" || st.phase === "WAITING") && humans < (st.handNo === 0 && !st.startWithFewer ? row.seats : 2)) {
      st.phase = "WAITING";
      st.startsAt = null;
    }
    await saveTable(tx, row, st, now, humans);
  });
  return { left: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Looking at the table and playing

/**
 * The player's table as they should see it now. With `since` (the version the app already has) it answers "unchanged" without
 * building a view when nothing has changed and nothing is due.
 */
export async function getMyClubTable(userId: string, since?: number) {
  const now = Date.now();
  const seat = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { id: true, tableId: true, lastSeenAt: true } });
  if (!seat) return { table: null, now };
  if (now - seat.lastSeenAt.getTime() > TOUCH_MS) await prisma.teenPattiClubSeat.update({ where: { id: seat.id }, data: { lastSeenAt: new Date(now) } });
  const head = await prisma.teenPattiClubTable.findUnique({ where: { id: seat.tableId }, select: { version: true, dueAt: true } });
  if (!head) return { table: null, now };
  const due = head.dueAt !== null && head.dueAt.getTime() <= now;
  if (!due && since !== undefined && since === head.version) return { unchanged: true as const, version: head.version, now };
  if (due) return withTable(seat.tableId, (tx, row, at) => viewAfter(tx, row, userId, at));
  const row = await prisma.teenPattiClubTable.findUnique({ where: { id: seat.tableId }, include: { seatRows: true } });
  if (!row) return { table: null, now };
  return { table: buildView(row, userId, await balanceOf(prisma, userId), now), now };
}

const TURN_BOUND: ActionKind[] = ["CHAAL", "RAISE", "SHOW", "SIDE_SHOW", "ACCEPT", "DENY"];

export async function clubAction(userId: string, kind: ActionKind, turnNo?: number) {
  const seat = await prisma.teenPattiClubSeat.findUnique({ where: { userId }, select: { tableId: true } });
  if (!seat) throw new ApiError(404, "You are not at a table.");
  if (kind === "CHAAL" || kind === "RAISE" || kind === "SHOW") await assertCanTransact(userId);
  try {
    return await withTable(seat.tableId, async (tx, row, now) => {
      if (!row) throw new ApiError(404, "The table has closed.");
      const st = stateOf(row);
      if (st.phase !== "PLAYING" || !st.hand || st.hand.over) throw new ApiError(409, "No hand is being played right now.");
      const idx = playerIndex(st.hand, userId);
      if (idx < 0) throw new ApiError(400, "You are not in this hand - you will be dealt in the next one.");
      if (TURN_BOUND.includes(kind) && turnNo !== undefined && turnNo !== st.hand.turnNo) throw new ApiError(409, "The table moved on - look again.");
      const copy = clone(st.hand);
      const { cost } = act(copy, idx, kind, now);
      if (cost > 0) {
        await takeMoney(tx, userId, cost);
        await tx.teenPattiClubResult.updateMany({ where: { handId: st.handId!, userId }, data: { invested: { increment: cost / 100 } } });
      }
      st.hand = copy;
      if (copy.over) await finalizeHand(tx, row, st);
      const humans = (await seatsOf(tx, row.id)).length;
      await saveTable(tx, row, st, now, humans);
      return viewAfter(tx, await reload(tx, row.id), userId, now);
    });
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// History

/** The player's finished hands: their money, how each ended, and the cards they may know (their own, and those turned over). */
export async function getMyClubHands(userId: string, limit: number) {
  const mine = await prisma.teenPattiClubResult.findMany({ where: { userId, outcome: { not: "PLAYING" } }, orderBy: { createdAt: "desc" }, take: limit });
  const hands = await prisma.teenPattiClubHand.findMany({ where: { id: { in: mine.map((m) => m.handId) } } });
  return mine.map((m) => {
    const hand = hands.find((x) => x.id === m.handId);
    const d = (hand?.detail ?? null) as null | { shown: string[]; players: { userId: string; seat: number; name: string; cards: number[]; invested: number; payout: number; packed: boolean }[] };
    return {
      id: m.handId,
      at: m.createdAt,
      outcome: m.outcome,
      invested: Number(m.invested),
      payout: Number(m.payout),
      boot: hand ? Number(hand.boot) : null,
      pot: hand ? Number(hand.pot) : null,
      rake: hand ? Number(hand.rake) : null,
      endedBy: hand?.endedBy ?? null,
      seedHash: hand?.seedHash ?? null,
      seed: hand?.seed ?? null,
      players:
        d?.players.map((p) => ({
          name: p.name,
          you: p.userId === userId,
          invested: p.invested,
          payout: p.payout,
          packed: p.packed,
          cards: p.userId === userId || d.shown.includes(p.userId) ? p.cards : null,
        })) ?? [],
    };
  });
}

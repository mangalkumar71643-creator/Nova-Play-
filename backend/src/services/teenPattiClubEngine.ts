import { createHash, createHmac } from "crypto";
import { generateServerSeed, hashServerSeed } from "../utils/rng";
import { handScore, HAND_NAMES } from "./teenPattiService";

/**
 * Teen Patti Club: the rules of one hand of real Teen Patti for 2 or 3 players, with no database in it.
 * teenPattiClubService.ts keeps the tables, the wallets and the clock; this file is only the game, so it can be
 * played over and over in a test (scripts/check-teen-patti-club.ts).
 *
 * All money here is in paise (whole numbers), so nothing is ever rounded away.
 *
 * THE GAME
 *  - A 52-card deck, three cards to each player, face down. Every player puts the boot in the pot first.
 *  - Turns go round the table (seat order, starting left of the dealer). On your turn you play Blind (cards not
 *    looked at) or Seen (you looked). The "stake" is the Blind price of a bet:
 *        Blind chaal  = stake            Seen chaal  = 2 x stake
 *        Blind raise  = 2 x stake        Seen raise  = 4 x stake        (a raise makes the stake 2 x stake)
 *    The stake is capped (MAX_STAKE_X x boot), so a raise is not offered above it.
 *  - Pack (fold) at any time and your money stays in the pot. See your cards at any time (they cannot be hidden again).
 *  - Show: when only two players are left, pay a chaal and both hands are turned over. The better hand wins.
 *    Equal hands: the player who asked for the show loses.
 *  - Side show: a Seen player, with three still in, may ask the player just before them (who must be Seen too) to
 *    compare cards. If that player says yes, the two of them see each other's cards, the lower hand packs (equal hands:
 *    the one who asked packs). If no (or no answer in time), play goes on. It costs nothing to ask.
 *  - Pot limit: when the pot reaches POT_LIMIT_X x boot, everyone still in is shown and the best hand wins (equal best
 *    hands split the pot).
 *  - Hands, best first: Trail (three of a kind), Pure Sequence, Sequence, Color, Pair, High Card. A-K-Q is the top
 *    sequence, then A-2-3, then K-Q-J ... 4-3-2. (teenPattiService.handScore.)
 *  - No answer in time on your turn = you pack.
 *
 * THE HOUSE
 *  - Whatever way a hand ends (everyone else packs, a show, the pot limit) the house keeps a rake of at least 5% of the
 *    whole pot, rounded UP to the paisa; the winner gets the rest. The house never plays a hand, never sees a card, and
 *    takes the same share of every pot, so it keeps at least 5% of everything staked (the check script plays tens of
 *    thousands of hands to show it).
 *
 * THE DEAL
 *  - A secret seed is made for every hand and its SHA-256 hash is published before the first move; the seed is
 *    published when the hand is over, and shuffledDeck(seed) is the whole shuffle, so a player can check the deal.
 */

export const MIN_RAKE_BPS = 500; // 5.00% of the pot, the least the house keeps

export const CLUB = {
  BOOTS: [5, 10, 50, 100, 500, 1000],
  SEATS: [2, 3],
  TURN_MS: 20_000,
  SIDE_SHOW_MS: 10_000,
  RESULT_MS: 8_000,
  START_MS: 5_000,
  /** The most the Blind stake can grow to, in boots (a Seen chaal then costs twice that). */
  MAX_STAKE_X: 16,
  /** The pot at which everyone still in is shown, in boots. */
  POT_LIMIT_X: 250,
  /** The wallet a player needs to sit down and to be dealt in again, in boots. */
  MIN_SIT_X: 60,
};

export class ClubError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ActionKind = "SEE" | "PACK" | "CHAAL" | "RAISE" | "SHOW" | "SIDE_SHOW" | "ACCEPT" | "DENY";
export const ACTION_KINDS: ActionKind[] = ["SEE", "PACK", "CHAAL", "RAISE", "SHOW", "SIDE_SHOW", "ACCEPT", "DENY"];

export type LogKind = "DEAL" | "SEE" | "CHAAL" | "RAISE" | "PACK" | "TIMEOUT" | "LEFT" | "SHOW" | "SIDE_ASK" | "SIDE_YES" | "SIDE_NO" | "SIDE_LOSS" | "END";

export interface LogEntry {
  seq: number;
  at: number;
  kind: LogKind;
  seat: number;
  /** The other seat (side show), or the winner's seat (END). */
  to?: number;
  /** Paise. */
  amount?: number;
}

export interface HandPlayer {
  userId: string;
  seat: number;
  name: string;
  uid: number | null;
  cards: number[];
  seen: boolean;
  packed: boolean;
  /** Paise put in this hand so far, boot included. */
  invested: number;
  timedOut: boolean;
  left: boolean;
}

export interface HandResult {
  endedBy: "PACK" | "SHOW" | "POT_LIMIT";
  winners: string[];
  /** userId -> paise paid out. */
  payouts: Record<string, number>;
  pot: number;
  rake: number;
  rakeBps: number;
  /** Whose cards were turned over for everyone. */
  shown: string[];
  /** The player who asked for the show (equal hands lose). */
  asker: string | null;
}

export interface HandState {
  v: 1;
  no: number;
  seed: string;
  seedHash: string;
  /** Paise. */
  boot: number;
  maxStake: number;
  potLimit: number;
  rakeBps: number;
  turnMs: number;
  players: HandPlayer[];
  /** Index into players. */
  dealer: number;
  pot: number;
  stake: number;
  /** Index into players; -1 once the hand is over. */
  turn: number;
  /** Counts every change of whose turn it is; a request carries the one it was made for. */
  turnNo: number;
  turnEndsAt: number;
  sideShow: null | { from: number; to: number; endsAt: number };
  /** [who can see, whose cards]: what the two players of an accepted side show know of each other. */
  peeks: [number, number][];
  seq: number;
  log: LogEntry[];
  startedAt: number;
  over: boolean;
  result: HandResult | null;
}

const LOG_KEEP = 40;

// ---------------------------------------------------------------------------------------------------------------------
// The deal

/** The whole shuffle, from the hand's seed: Fisher-Yates over HMAC-SHA256 bytes, with rejection sampling (no bias). */
export function shuffledDeck(seed: string): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let counter = 0;
  let buf: Buffer = Buffer.alloc(0);
  let pos = 0;
  const nextByte = () => {
    if (pos >= buf.length) {
      buf = createHmac("sha256", seed).update(`teen-patti-club:${counter++}`).digest();
      pos = 0;
    }
    return buf[pos++];
  };
  const below = (n: number) => {
    const limit = 256 - (256 % n);
    let b: number;
    do b = nextByte();
    while (b >= limit);
    return b % n;
  };
  for (let i = 51; i > 0; i--) {
    const j = below(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Three cards each, one at a time, the player left of the dealer first. Returns the cards by player index. */
export function dealCards(seed: string, players: number, dealer: number): number[][] {
  const deck = shuffledDeck(seed);
  const hands: number[][] = Array.from({ length: players }, () => []);
  for (let round = 0; round < 3; round++)
    for (let k = 0; k < players; k++) hands[(dealer + 1 + k) % players].push(deck[round * players + k]);
  return hands;
}

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number) => paise / 100;

// ---------------------------------------------------------------------------------------------------------------------
// Hands

export function newHand(o: {
  no: number;
  boot: number;
  players: { userId: string; seat: number; name: string; uid: number | null }[];
  lastDealerSeat: number | null;
  now: number;
  seed?: string;
  rakeBps?: number;
  turnMs?: number;
}): HandState {
  const roster = [...o.players].sort((a, b) => a.seat - b.seat);
  const n = roster.length;
  if (n < 2 || n > 3) throw new ClubError("A hand needs 2 or 3 players.");
  if (!Number.isInteger(o.boot) || o.boot <= 0) throw new ClubError("Bad boot.");
  const rakeBps = Math.max(MIN_RAKE_BPS, Math.round(o.rakeBps ?? MIN_RAKE_BPS));
  const seed = o.seed ?? generateServerSeed();
  const after = o.lastDealerSeat === null ? -1 : roster.findIndex((p) => p.seat > o.lastDealerSeat!);
  const dealer = o.lastDealerSeat === null ? 0 : after === -1 ? 0 : after;
  const cards = dealCards(seed, n, dealer);
  const h: HandState = {
    v: 1,
    no: o.no,
    seed,
    seedHash: hashServerSeed(seed),
    boot: o.boot,
    maxStake: o.boot * CLUB.MAX_STAKE_X,
    potLimit: o.boot * CLUB.POT_LIMIT_X,
    rakeBps,
    turnMs: o.turnMs ?? CLUB.TURN_MS,
    players: roster.map((p, i) => ({
      userId: p.userId,
      seat: p.seat,
      name: p.name,
      uid: p.uid,
      cards: cards[i],
      seen: false,
      packed: false,
      invested: o.boot,
      timedOut: false,
      left: false,
    })),
    dealer,
    pot: o.boot * n,
    stake: o.boot,
    turn: -1,
    turnNo: 0,
    turnEndsAt: 0,
    sideShow: null,
    peeks: [],
    seq: 0,
    log: [],
    startedAt: o.now,
    over: false,
    result: null,
  };
  h.turn = nextActive(h, dealer);
  h.turnEndsAt = o.now + h.turnMs;
  log(h, o.now, "DEAL", h.players[dealer].seat);
  return h;
}

const activeIdx = (h: HandState) => h.players.map((_, i) => i).filter((i) => !h.players[i].packed);

function nextActive(h: HandState, from: number): number {
  const n = h.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (!h.players[i].packed) return i;
  }
  return from;
}

function prevActive(h: HandState, from: number): number {
  const n = h.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from - k + n * 2) % n;
    if (!h.players[i].packed) return i;
  }
  return from;
}

function log(h: HandState, at: number, kind: LogKind, idxOrSeat: number, to?: number, amount?: number, bySeat = true) {
  const entry: LogEntry = { seq: ++h.seq, at, kind, seat: bySeat ? idxOrSeat : h.players[idxOrSeat].seat };
  if (to !== undefined) entry.to = to;
  if (amount !== undefined) entry.amount = amount;
  h.log.push(entry);
  if (h.log.length > LOG_KEEP) h.log.splice(0, h.log.length - LOG_KEEP);
}

const seatOf = (h: HandState, idx: number) => h.players[idx].seat;

function advanceTurn(h: HandState, at: number) {
  h.turn = nextActive(h, h.turn);
  h.turnNo++;
  h.turnEndsAt = at + h.turnMs;
}

/** The hand is over: the rake comes off the pot, the rest goes to the winner(s). */
function finish(h: HandState, winners: number[], endedBy: HandResult["endedBy"], at: number, shown: number[], asker: number | null) {
  h.over = true;
  h.turn = -1;
  h.sideShow = null;
  h.turnEndsAt = 0;
  h.turnNo++;
  // Rounded up to the paisa: never less than the rakeBps share, whatever the pot is.
  const rake = Math.ceil((h.pot * h.rakeBps) / 10000);
  const net = h.pot - rake;
  const each = Math.floor(net / winners.length);
  let extra = net - each * winners.length;
  const payouts: Record<string, number> = {};
  for (const w of winners) {
    payouts[h.players[w].userId] = each + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  h.result = {
    endedBy,
    winners: winners.map((w) => h.players[w].userId),
    payouts,
    pot: h.pot,
    rake,
    rakeBps: h.rakeBps,
    shown: shown.map((i) => h.players[i].userId),
    asker: asker === null ? null : h.players[asker].userId,
  };
  log(h, at, "END", winners.length === 1 ? seatOf(h, winners[0]) : -1);
}

/** Cards turned over: the best hand wins; equal best hands split the pot, except that in a show the asker loses. */
function showdown(h: HandState, idxs: number[], asker: number | null, endedBy: HandResult["endedBy"], at: number) {
  const scores = idxs.map((i) => handScore(h.players[i].cards).score);
  const best = Math.max(...scores);
  let winners = idxs.filter((_, k) => scores[k] === best);
  if (asker !== null && winners.length > 1 && winners.includes(asker)) winners = winners.filter((i) => i !== asker);
  finish(h, winners, endedBy, at, idxs, asker);
}

function doPack(h: HandState, idx: number, at: number, why: "PACK" | "TIMEOUT" | "LEFT" | "SIDE") {
  const p = h.players[idx];
  if (p.packed) return;
  p.packed = true;
  if (why === "TIMEOUT") p.timedOut = true;
  if (why === "LEFT") p.left = true;
  if (why !== "SIDE") log(h, at, why, idx, undefined, undefined, false); // a side show's loser is logged as SIDE_LOSS
  const ss = h.sideShow;
  if (ss && (ss.from === idx || ss.to === idx)) {
    h.sideShow = null;
    // The player who was asked is gone: the asker carries on, with a fresh clock.
    if (ss.to === idx && ss.from !== idx) h.turnEndsAt = at + h.turnMs;
  }
  const left = activeIdx(h);
  if (left.length === 1) {
    finish(h, [left[0]], "PACK", at, [], null);
    return;
  }
  if (h.turn === idx) advanceTurn(h, at);
}

// ---------------------------------------------------------------------------------------------------------------------
// What a player can do

export interface Actions {
  see: boolean;
  pack: boolean;
  /** Paise a chaal costs now, or null when it is not this player's turn. */
  chaal: number | null;
  raise: { cost: number; stake: number } | null;
  show: number | null;
  sideShow: boolean;
  /** A side show is waiting for this player's answer. */
  respond: boolean;
}

const NONE: Actions = { see: false, pack: false, chaal: null, raise: null, show: null, sideShow: false, respond: false };

export function actionsFor(h: HandState, idx: number): Actions {
  const p = h.players[idx];
  if (h.over || !p || p.packed) return { ...NONE };
  const a: Actions = { ...NONE, see: !p.seen, pack: true };
  const ss = h.sideShow;
  if (ss) {
    a.respond = ss.to === idx;
    return a;
  }
  if (h.turn !== idx) return a;
  const times = p.seen ? 2 : 1;
  a.chaal = h.stake * times;
  if (h.stake * 2 <= h.maxStake) a.raise = { cost: h.stake * 2 * times, stake: h.stake * 2 };
  const alive = activeIdx(h).length;
  if (alive === 2) a.show = h.stake * times;
  if (alive >= 3 && p.seen && h.players[prevActive(h, idx)].seen) a.sideShow = true;
  return a;
}

/**
 * Does what the player asked and returns the paise it costs. The caller must take that money from the player's wallet
 * and keep the new state only when that worked (it works on a copy).
 */
export function act(h: HandState, idx: number, kind: ActionKind, now: number): { cost: number } {
  if (h.over) throw new ClubError("This hand is over.");
  const p = h.players[idx];
  if (!p || p.packed) throw new ClubError("You are not in this hand.");
  const a = actionsFor(h, idx);
  switch (kind) {
    case "SEE": {
      if (!a.see) throw new ClubError("You have already seen your cards.");
      p.seen = true;
      log(h, now, "SEE", idx, undefined, undefined, false);
      return { cost: 0 };
    }
    case "PACK": {
      doPack(h, idx, now, "PACK");
      return { cost: 0 };
    }
    case "CHAAL": {
      if (a.chaal === null) throw new ClubError(h.sideShow ? "A side show is being decided." : "It is not your turn.");
      bet(h, idx, a.chaal, now, "CHAAL");
      return { cost: a.chaal };
    }
    case "RAISE": {
      if (a.chaal === null) throw new ClubError(h.sideShow ? "A side show is being decided." : "It is not your turn.");
      if (!a.raise) throw new ClubError("The stake is already at the table limit - you can chaal, pack or show.");
      h.stake = a.raise.stake;
      bet(h, idx, a.raise.cost, now, "RAISE");
      return { cost: a.raise.cost };
    }
    case "SHOW": {
      if (a.show === null) throw new ClubError(h.turn !== idx ? "It is not your turn." : "A show needs exactly two players left.");
      p.invested += a.show;
      h.pot += a.show;
      log(h, now, "SHOW", idx, undefined, a.show, false);
      showdown(h, activeIdx(h), idx, "SHOW", now);
      return { cost: a.show };
    }
    case "SIDE_SHOW": {
      if (!a.sideShow) throw new ClubError("A side show needs three players, your cards seen, and the player before you to have seen theirs too.");
      const to = prevActive(h, idx);
      h.sideShow = { from: idx, to, endsAt: now + CLUB.SIDE_SHOW_MS };
      log(h, now, "SIDE_ASK", idx, seatOf(h, to), undefined, false);
      return { cost: 0 };
    }
    case "ACCEPT":
    case "DENY": {
      if (!a.respond) throw new ClubError("Nobody has asked you for a side show.");
      answerSideShow(h, kind === "ACCEPT", now);
      return { cost: 0 };
    }
    default:
      throw new ClubError("Unknown move.");
  }
}

function bet(h: HandState, idx: number, cost: number, at: number, kind: "CHAAL" | "RAISE") {
  const p = h.players[idx];
  p.invested += cost;
  h.pot += cost;
  log(h, at, kind, idx, undefined, cost, false);
  if (h.pot >= h.potLimit) {
    showdown(h, activeIdx(h), null, "POT_LIMIT", at);
    return;
  }
  advanceTurn(h, at);
}

function answerSideShow(h: HandState, accept: boolean, at: number) {
  const ss = h.sideShow;
  if (!ss) return;
  const { from, to } = ss;
  h.sideShow = null;
  if (!accept) {
    log(h, at, "SIDE_NO", to, seatOf(h, from), undefined, false);
    h.turnEndsAt = at + h.turnMs;
    h.turnNo++;
    return;
  }
  log(h, at, "SIDE_YES", to, seatOf(h, from), undefined, false);
  h.peeks.push([from, to], [to, from]);
  const sf = handScore(h.players[from].cards).score;
  const st = handScore(h.players[to].cards).score;
  // The lower hand packs; equal hands: the player who asked.
  const loser = sf > st ? to : from;
  log(h, at, "SIDE_LOSS", loser, seatOf(h, loser === from ? to : from), undefined, false);
  doPack(h, loser, at, "SIDE");
  if (!h.over && loser !== from) {
    h.turnEndsAt = at + h.turnMs;
    h.turnNo++;
  }
}

/** A player leaves the table in the middle of a hand: packed, and what they put in stays in the pot. */
export function leaveHand(h: HandState, idx: number, now: number) {
  if (h.over || h.players[idx].packed) return;
  doPack(h, idx, now, "LEFT");
}

/** When the hand next needs the clock (the turn, or a side show answer), or null when it is over. */
export function nextDeadline(h: HandState): number | null {
  if (h.over) return null;
  return h.sideShow ? h.sideShow.endsAt : h.turnEndsAt;
}

/**
 * Plays out what has run out of time by `now`: a side show nobody answered is refused, a player who did not move packs.
 * Each step is dated at its own deadline, so catching up after a long silence gives the same hand as being there.
 */
export function expire(h: HandState, now: number): boolean {
  let changed = false;
  for (let i = 0; i < 24 && !h.over; i++) {
    const due = nextDeadline(h);
    if (due === null || now < due) break;
    changed = true;
    if (h.sideShow) answerSideShow(h, false, due);
    else doPack(h, h.turn, due, "TIMEOUT");
  }
  return changed;
}

export function playerIndex(h: HandState, userId: string): number {
  return h.players.findIndex((p) => p.userId === userId);
}

// ---------------------------------------------------------------------------------------------------------------------
// What a player is shown

export interface PlayerView {
  seat: number;
  name: string;
  uid: number | null;
  seen: boolean;
  packed: boolean;
  invested: number;
  timedOut: boolean;
  left: boolean;
  dealer: boolean;
  /** Only your own cards once you have looked, the cards a side show showed you, and cards turned over at the end. */
  cards: number[] | null;
  handName: string | null;
}

export interface LogView extends LogEntry {
  /** Who the entry is about, and (side show) the other player: by name, so the entry stays right if a seat is taken by somebody else later. */
  name: string;
  toName?: string;
}

export interface HandView {
  no: number;
  boot: number;
  pot: number;
  stake: number;
  maxStake: number;
  potLimit: number;
  rakeBps: number;
  turnSeat: number | null;
  turnNo: number;
  turnEndsAt: number;
  sideShow: null | { fromSeat: number; toSeat: number; endsAt: number };
  over: boolean;
  seedHash: string;
  /** Revealed once the hand is over. */
  seed: string | null;
  players: PlayerView[];
  log: LogView[];
  result: null | {
    endedBy: HandResult["endedBy"];
    winnerSeats: number[];
    payouts: { seat: number; amount: number }[];
    pot: number;
    rake: number;
    rakeBps: number;
    shownSeats: number[];
    askerSeat: number | null;
  };
  you: null | { seat: number; actions: Actions };
}

export function viewHand(h: HandState, viewerId: string | null): HandView {
  const me = viewerId === null ? -1 : playerIndex(h, viewerId);
  const shown = new Set(h.result?.shown ?? []);
  const players: PlayerView[] = h.players.map((p, i) => {
    const visible =
      (i === me && p.seen) || h.peeks.some(([viewer, target]) => viewer === me && target === i) || (h.over && shown.has(p.userId));
    return {
      seat: p.seat,
      name: p.name,
      uid: p.uid,
      seen: p.seen,
      packed: p.packed,
      invested: p.invested,
      timedOut: p.timedOut,
      left: p.left,
      dealer: i === h.dealer,
      cards: visible ? [...p.cards] : null,
      handName: visible ? HAND_NAMES[handScore(p.cards).category] : null,
    };
  });
  const r = h.result;
  const seatOfUser = (id: string) => h.players[playerIndex(h, id)].seat;
  return {
    no: h.no,
    boot: h.boot,
    pot: h.pot,
    stake: h.stake,
    maxStake: h.maxStake,
    potLimit: h.potLimit,
    rakeBps: h.rakeBps,
    turnSeat: h.turn >= 0 ? h.players[h.turn].seat : null,
    turnNo: h.turnNo,
    turnEndsAt: h.turnEndsAt,
    sideShow: h.sideShow ? { fromSeat: seatOf(h, h.sideShow.from), toSeat: seatOf(h, h.sideShow.to), endsAt: h.sideShow.endsAt } : null,
    over: h.over,
    seedHash: h.seedHash,
    seed: h.over ? h.seed : null,
    players,
    log: h.log.map((e) => {
      const who = h.players.find((p) => p.seat === e.seat);
      const other = e.to === undefined ? undefined : h.players.find((p) => p.seat === e.to);
      return { ...e, name: who?.name ?? "", ...(other ? { toName: other.name } : {}) };
    }),
    result: r
      ? {
          endedBy: r.endedBy,
          winnerSeats: r.winners.map(seatOfUser),
          payouts: Object.entries(r.payouts).map(([id, amount]) => ({ seat: seatOfUser(id), amount })),
          pot: r.pot,
          rake: r.rake,
          rakeBps: r.rakeBps,
          shownSeats: r.shown.map(seatOfUser),
          askerSeat: r.asker === null ? null : seatOfUser(r.asker),
        }
      : null,
    you: me >= 0 ? { seat: h.players[me].seat, actions: actionsFor(h, me) } : null,
  };
}

/** The whole shuffle again from a published seed, for the "check this deal" screen and the tests. */
export function verifyDeal(seed: string, seedHash: string, players: number, dealer: number): number[][] | null {
  if (createHash("sha256").update(seed).digest("hex") !== seedHash) return null;
  return dealCards(seed, players, dealer);
}

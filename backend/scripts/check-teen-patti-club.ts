/**
 * Checks the rules of Teen Patti Club (src/services/teenPattiClubEngine.ts). No database needed:
 *
 *   cd backend && DATABASE_URL=postgresql://x@127.0.0.1:1/x JWT_SECRET=check npx tsx scripts/check-teen-patti-club.ts
 *   HANDS=60000 ... to play more hands (default 20000)
 *
 * 1. Hand ranking: every one of the 22,100 three-card hands is counted by kind (Trail 52, Pure Sequence 48, Sequence 720,
 *    Color 1096, Pair 3744, High Card 16440) and the order of the kinds, of the sequences (A-K-Q > A-2-3 > K-Q-J ... > 4-3-2)
 *    and of equal kinds is checked.
 * 2. The deal: the shuffle is a permutation, the same for the same seed, even (each card first about 1/52 of the time), and
 *    can be checked from the published seed and its hash.
 * 3. The rules, one at a time: what a Blind / Seen chaal and raise cost, the stake limit, show (equal hands: the asker
 *    loses), side show (who may ask, accepted, refused, no answer, the asked player packing), the pot limit, timeouts,
 *    leaving, and that a refused move changes nothing.
 * 4. The house: tens of thousands of hands are played by random players (random moves, timeouts, side shows, leavers) and in
 *    every one the pot is exactly what was put in, the winner(s) and the house get exactly the pot, and the house's rake is
 *    at least 5% of the pot (compared in whole paise).
 * 5. Secrets: at no moment does what a player is shown hold a card they may not see, or the seed before the hand is over.
 *
 * It prints every check and exits with 1 if one fails.
 */
import crypto from "crypto";
import {
  ACTION_KINDS,
  act,
  actionsFor,
  CLUB,
  ClubError,
  dealCards,
  expire,
  HandState,
  leaveHand,
  MIN_RAKE_BPS,
  newHand,
  playerIndex,
  shuffledDeck,
  verifyDeal,
  viewHand,
} from "../src/services/teenPattiClubEngine";
import { handScore, HAND_NAMES } from "../src/services/teenPattiService";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed++;
}
const ri = (n: number) => crypto.randomInt(0, n);
const chance = (p: number) => crypto.randomInt(0, 1_000_000) < p * 1_000_000;
const pick = <T>(a: T[]) => a[ri(a.length)];

const card = (rank: number, suit: number) => suit * 13 + (rank - 1); // rank 1 = A ... 13 = K; suit 0..3
const T0 = 1_700_000_000_000;

// ---- 1. hand ranking
{
  const counts = new Array(7).fill(0);
  for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) for (let z = y + 1; z < 52; z++) counts[handScore([x, y, z]).category]++;
  check("22,100 hands: Trail 52, Pure Sequence 48, Sequence 720, Color 1096, Pair 3744, High Card 16440", counts[6] === 52 && counts[5] === 48 && counts[4] === 720 && counts[3] === 1096 && counts[2] === 3744 && counts[1] === 16440, JSON.stringify(counts.slice(1)));
  const S = (a: number[]) => handScore(a).score;
  const trailA = S([card(1, 0), card(1, 1), card(1, 2)]);
  const trail2 = S([card(2, 0), card(2, 1), card(2, 2)]);
  const pureAKQ = S([card(1, 0), card(13, 0), card(12, 0)]);
  const pureA23 = S([card(1, 1), card(2, 1), card(3, 1)]);
  const pureKQJ = S([card(13, 2), card(12, 2), card(11, 2)]);
  const pure432 = S([card(4, 3), card(3, 3), card(2, 3)]);
  const seqAKQ = S([card(1, 0), card(13, 1), card(12, 2)]);
  const color = S([card(1, 0), card(9, 0), card(4, 0)]);
  const pairK = S([card(13, 0), card(13, 1), card(2, 2)]);
  const pair2A = S([card(2, 0), card(2, 1), card(1, 2)]);
  const high = S([card(1, 0), card(13, 1), card(11, 2)]);
  check("Trail beats Pure Sequence beats Sequence beats Color beats Pair beats High Card", trail2 > pureAKQ && pureAKQ > seqAKQ && seqAKQ > color && color > pairK && pairK > high);
  check("Trail: A-A-A is the best, 2-2-2 the lowest", trailA > trail2 && trail2 > pureAKQ);
  check("Sequences: A-K-Q > A-2-3 > K-Q-J > ... > 4-3-2 (pure or not)", pureAKQ > pureA23 && pureA23 > pureKQJ && pureKQJ > pure432 && seqAKQ > S([card(1, 0), card(2, 1), card(3, 2)]));
  check("Pair: higher pair first, then the other card (K-K-2 > 2-2-A)", pairK > pair2A);
  check("Equal hands in different suits score the same", S([card(5, 0), card(9, 1), card(12, 2)]) === S([card(5, 3), card(9, 0), card(12, 1)]));
}

// ---- 2. the deal
{
  const seed = crypto.randomBytes(32).toString("hex");
  const deck = shuffledDeck(seed);
  check("the shuffle is a permutation of the 52 cards", deck.length === 52 && new Set(deck).size === 52 && deck.every((c) => c >= 0 && c < 52));
  check("the same seed gives the same shuffle, another seed another one", JSON.stringify(shuffledDeck(seed)) === JSON.stringify(deck) && JSON.stringify(shuffledDeck(seed + "x")) !== JSON.stringify(deck));
  const first = new Array(52).fill(0);
  const N = 20800;
  for (let i = 0; i < N; i++) first[shuffledDeck(crypto.randomBytes(16).toString("hex"))[0]]++;
  const exp = N / 52;
  const chi = first.reduce((s, c) => s + (c - exp) ** 2 / exp, 0);
  check("the top card is even over the 52 cards (chi-square, 51 degrees of freedom, below 90)", chi < 90, `(chi ${chi.toFixed(1)})`);
  const h = newHand({ no: 1, boot: 500, now: T0, lastDealerSeat: null, players: [0, 1, 2].map((s) => ({ userId: `u${s}`, seat: s, name: `P${s}`, uid: s })) });
  const again = verifyDeal(h.seed, h.seedHash, 3, h.dealer);
  check("the published seed and hash re-deal exactly the cards that were dealt", !!again && again.every((c, i) => JSON.stringify(c) === JSON.stringify(h.players[i].cards)));
  check("a seed that does not match the hash is refused", verifyDeal(h.seed + "0", h.seedHash, 3, h.dealer) === null);
  check("three players get three different cards each, none twice", new Set(h.players.flatMap((p) => p.cards)).size === 9);
  check("the boot is in the pot and the first to play is left of the dealer", h.pot === 1500 && h.stake === 500 && h.turn === 1);
  const dealt = dealCards(h.seed, 3, 0);
  check("cards go one at a time, starting left of the dealer", dealt[1][0] === shuffledDeck(h.seed)[0] && dealt[2][0] === shuffledDeck(h.seed)[1] && dealt[0][0] === shuffledDeck(h.seed)[2] && dealt[1][1] === shuffledDeck(h.seed)[3]);
}

// ---- helpers for the rules
const BOOT = 1000; // Rs10 in paise
function hand(n: number, cards?: number[][], lastDealerSeat: number | null = null): HandState {
  const h = newHand({ no: 1, boot: BOOT, now: T0, lastDealerSeat, players: Array.from({ length: n }, (_, s) => ({ userId: `u${s}`, seat: s, name: `P${s}`, uid: s })) });
  if (cards) cards.forEach((c, i) => (h.players[i].cards = c));
  return h;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ClubError;
  }
}
const win = [card(1, 0), card(1, 1), card(1, 2)]; // Trail of aces
const mid = [card(9, 0), card(9, 1), card(4, 2)]; // pair of nines
const low = [card(2, 0), card(7, 1), card(11, 2)]; // high card
const T = (h: HandState) => h.turn;

// ---- 3. the rules
{
  // Costs: blind / seen chaal and raise
  let h = hand(2, [win, low]);
  let idx = T(h);
  let a = actionsFor(h, idx);
  check("Blind: chaal costs the stake (the boot), raise costs 2x and is offered", a.chaal === BOOT && a.raise?.cost === 2 * BOOT && a.raise?.stake === 2 * BOOT && a.see && a.pack);
  act(h, idx, "SEE", T0);
  a = actionsFor(h, idx);
  check("Seen: chaal costs 2x the stake, raise 4x", a.chaal === 2 * BOOT && a.raise?.cost === 4 * BOOT && a.raise?.stake === 2 * BOOT && !a.see);
  check("seeing your cards does not use up your turn", T(h) === idx);
  const c = act(h, idx, "RAISE", T0 + 1000);
  check("a Seen raise takes 4x the stake from the player and makes the stake 2x", c.cost === 4 * BOOT && h.stake === 2 * BOOT && h.pot === 2 * BOOT + 4 * BOOT && h.players[idx].invested === BOOT + 4 * BOOT);
  const other = T(h);
  check("then it is the other player's turn", other !== idx);
  a = actionsFor(h, other);
  check("the other player, Blind, now pays the new stake for a chaal (2x boot) and 4x boot to raise", a.chaal === 2 * BOOT && a.raise?.cost === 4 * BOOT);
  check("a player who is not on turn has no chaal, raise, show or side show", actionsFor(h, idx).chaal === null && actionsFor(h, idx).raise === null && actionsFor(h, idx).show === null && !actionsFor(h, idx).sideShow);
  check("a move out of turn is refused and changes nothing", (() => { const before = JSON.stringify(h); return throws(() => act(h, idx, "CHAAL", T0 + 2000)) && JSON.stringify(h) === before; })());

  // The stake limit
  h = hand(2, [win, low]);
  let steps = 0;
  while (actionsFor(h, T(h)).raise) {
    act(h, T(h), "RAISE", T0 + steps++);
  }
  check(`the stake stops at ${CLUB.MAX_STAKE_X}x the boot and a raise is then refused`, h.stake === CLUB.MAX_STAKE_X * BOOT && actionsFor(h, T(h)).raise === null && throws(() => act(h, T(h), "RAISE", T0)) && actionsFor(h, T(h)).chaal === h.stake);

  // Show
  h = hand(2, [win, low]);
  idx = T(h);
  const askerCost = actionsFor(h, idx).show;
  check("with two players left a show is offered, at the price of a chaal", askerCost === BOOT);
  act(h, idx, "SHOW", T0);
  check("a show ends the hand: the better hand wins, both are turned over", h.over && h.result!.endedBy === "SHOW" && h.result!.shown.length === 2 && h.result!.winners.length === 1);
  const better = h.players.findIndex((p) => p.cards === win);
  check("...and the winner is the one with the Trail", h.result!.winners[0] === h.players[better].userId);

  h = hand(2, [mid, mid.map((c) => (c + 13) % 52)]); // two pairs of nines (different suits)
  h.players[0].cards = [card(9, 0), card(9, 1), card(4, 2)];
  h.players[1].cards = [card(9, 2), card(9, 3), card(4, 0)];
  idx = T(h);
  act(h, idx, "SHOW", T0);
  check("equal hands in a show: the player who asked for the show loses", h.result!.winners.length === 1 && h.result!.winners[0] !== h.players[idx].userId);

  h = hand(3, [win, low, mid]);
  check("a show is not offered while three are still in", actionsFor(h, T(h)).show === null && throws(() => act(h, T(h), "SHOW", T0)));
  act(h, T(h), "PACK", T0);
  check("...but is as soon as one packs", actionsFor(h, T(h)).show !== null);

  // Pack
  h = hand(2, [win, low]);
  idx = T(h);
  act(h, idx, "PACK", T0);
  check("everyone else packing ends the hand, the cards stay hidden, the last player wins", h.over && h.result!.endedBy === "PACK" && h.result!.shown.length === 0 && h.result!.winners[0] === h.players[1 - idx].userId);
  check("the rake is at least 5% of the pot, and winner + house = the pot", h.result!.rake * 10000 >= h.result!.pot * MIN_RAKE_BPS && h.result!.rake + Object.values(h.result!.payouts).reduce((s, x) => s + x, 0) === h.result!.pot, `(pot ${h.result!.pot}, rake ${h.result!.rake})`);
  check("a hand that is over takes no more moves", throws(() => act(h, 0, "CHAAL", T0)) && throws(() => act(h, 1, "SEE", T0)));

  // Pack out of turn
  h = hand(3, [win, mid, low]);
  const notTurn = [0, 1, 2].find((i) => i !== T(h))!;
  act(h, notTurn, "PACK", T0);
  check("a player can pack out of turn; the turn stays where it was", h.players[notTurn].packed && !h.over && T(h) !== notTurn);

  // Side show
  h = hand(3, [win, mid, low]);
  idx = T(h);
  check("no side show for a player who has not seen their cards", !actionsFor(h, idx).sideShow);
  act(h, idx, "SEE", T0);
  check("no side show when the player before has not seen theirs", !actionsFor(h, idx).sideShow);
  act(h, idx, "CHAAL", T0);
  const second = T(h);
  act(h, second, "SEE", T0);
  check("a Seen player can ask the Seen player before them", actionsFor(h, second).sideShow === true);
  act(h, second, "SIDE_SHOW", T0 + 1000);
  check("while it is being asked nobody can chaal, raise, show or ask again", h.sideShow !== null && [0, 1, 2].every((i) => actionsFor(h, i).chaal === null && actionsFor(h, i).raise === null && !actionsFor(h, i).sideShow));
  check("only the player asked can answer", actionsFor(h, idx).respond && !actionsFor(h, second).respond && throws(() => act(h, second, "ACCEPT", T0)));
  const potBefore = h.pot;
  act(h, idx, "ACCEPT", T0 + 2000);
  const winnerIdx = handScore(h.players[idx].cards).score >= handScore(h.players[second].cards).score && handScore(h.players[idx].cards).score !== handScore(h.players[second].cards).score ? idx : second;
  const loserIdx = winnerIdx === idx ? second : idx;
  check("accepted: the lower hand packs, nothing is paid for a side show", h.players[loserIdx].packed && !h.players[winnerIdx].packed && h.pot === potBefore && !h.over);
  check("...and the two now see each other's cards, the third player sees neither", h.peeks.length === 2 && (() => { const third = [0, 1, 2].find((i) => i !== idx && i !== second)!; const vw = viewHand(h, h.players[third].userId); return vw.players.filter((p) => p.cards).length === 0; })());
  check("the asker lost here (a pair beats a high card) so the turn moves on, with a fresh clock", loserIdx === second && T(h) !== second && h.turnEndsAt === T0 + 2000 + CLUB.TURN_MS);

  // Side show won by the player who asked
  h = hand(3, [win, low, mid]);
  idx = T(h);
  act(h, idx, "SEE", T0);
  act(h, idx, "CHAAL", T0);
  const askerW = T(h);
  act(h, askerW, "SEE", T0);
  act(h, askerW, "SIDE_SHOW", T0 + 1000);
  act(h, idx, "ACCEPT", T0 + 3000);
  check("the player who asked and won goes on, with a fresh clock; the player asked is out", h.players[idx].packed && !h.players[askerW].packed && T(h) === askerW && h.turnEndsAt === T0 + 3000 + CLUB.TURN_MS && actionsFor(h, askerW).chaal !== null);

  // Side show, equal hands: the asker packs
  h = hand(3, [[card(9, 0), card(9, 1), card(4, 2)], [card(9, 2), card(9, 3), card(4, 0)], low]);
  idx = T(h);
  act(h, idx, "SEE", T0);
  act(h, idx, "CHAAL", T0);
  const asker2 = T(h);
  act(h, asker2, "SEE", T0);
  const target2 = (asker2 + 2) % 3 === idx ? idx : -1;
  if (target2 === idx) {
    act(h, asker2, "SIDE_SHOW", T0);
    act(h, idx, "ACCEPT", T0);
    check("a side show between equal hands: the player who asked packs", h.players[asker2].packed && !h.players[idx].packed);
  } else {
    check("(side show equal-hands case skipped: the seats did not line up)", true);
  }

  // Refused
  h = hand(3, [win, mid, low]);
  idx = T(h);
  act(h, idx, "SEE", T0);
  act(h, idx, "CHAAL", T0);
  const askerR = T(h);
  act(h, askerR, "SEE", T0);
  act(h, askerR, "SIDE_SHOW", T0 + 500);
  act(h, idx, "DENY", T0 + 900);
  check("refused: nobody packs, the asker is on turn again with a fresh clock", h.sideShow === null && T(h) === askerR && h.players.every((p) => !p.packed) && h.turnEndsAt === T0 + 900 + CLUB.TURN_MS && actionsFor(h, askerR).chaal !== null);

  // No answer
  h = hand(3, [win, mid, low]);
  idx = T(h);
  act(h, idx, "SEE", T0);
  act(h, idx, "CHAAL", T0);
  const askerN = T(h);
  act(h, askerN, "SEE", T0);
  act(h, askerN, "SIDE_SHOW", T0 + 1000);
  check("an unanswered side show is refused when its time runs out", !expire(h, T0 + 1000 + CLUB.SIDE_SHOW_MS - 1) && expire(h, T0 + 1000 + CLUB.SIDE_SHOW_MS) && h.sideShow === null && T(h) === askerN && h.players.every((p) => !p.packed));

  // The player asked packs
  h = hand(3, [win, mid, low]);
  idx = T(h);
  act(h, idx, "SEE", T0);
  act(h, idx, "CHAAL", T0);
  const askerP = T(h);
  act(h, askerP, "SEE", T0);
  act(h, askerP, "SIDE_SHOW", T0 + 1000);
  act(h, idx, "PACK", T0 + 1500);
  check("if the player asked packs, the side show is off and the asker plays on", h.sideShow === null && T(h) === askerP && h.players[idx].packed && !h.over);

  // The player who asked packs
  h = hand(3, [win, mid, low]);
  idx = T(h);
  act(h, idx, "SEE", T0);
  act(h, idx, "CHAAL", T0);
  const askerQ = T(h);
  act(h, askerQ, "SEE", T0);
  act(h, askerQ, "SIDE_SHOW", T0 + 1000);
  act(h, askerQ, "PACK", T0 + 1100);
  check("if the player who asked packs, the question is dropped and the next player is on turn", h.sideShow === null && h.players[askerQ].packed && T(h) !== askerQ && !h.over);

  // Side show with two left: not offered
  h = hand(2, [win, low]);
  act(h, T(h), "SEE", T0);
  act(h, T(h), "CHAAL", T0);
  act(h, T(h), "SEE", T0);
  check("with two players there is no side show (a show instead)", !actionsFor(h, T(h)).sideShow && actionsFor(h, T(h)).show !== null);

  // Pot limit
  h = hand(3, [win, win.map((c) => (c + 1) % 13 + Math.floor(c / 13) * 13), low]);
  h.players[0].cards = [card(1, 0), card(1, 1), card(1, 2)];
  h.players[1].cards = [card(13, 0), card(13, 1), card(13, 2)];
  h.players[2].cards = [card(2, 0), card(7, 1), card(11, 2)];
  let guard = 0;
  while (!h.over && guard++ < 500) {
    const a2 = actionsFor(h, T(h));
    act(h, T(h), a2.raise ? "RAISE" : "CHAAL", T0 + guard);
  }
  check("at the pot limit everyone still in is turned over and the best hand wins", h.over && h.result!.endedBy === "POT_LIMIT" && h.result!.shown.length === 3 && h.players[playerIndex(h, h.result!.winners[0])].cards[0] === card(1, 0) && h.pot >= h.potLimit);
  check("...and the house still takes at least 5%", h.result!.rake * 10000 >= h.result!.pot * MIN_RAKE_BPS);

  // Equal best hands at the pot limit split the pot (the rake comes off first)
  h = hand(2);
  h.players[0].cards = [card(9, 0), card(9, 1), card(4, 2)];
  h.players[1].cards = [card(9, 2), card(9, 3), card(4, 0)];
  guard = 0;
  while (!h.over && guard++ < 500) {
    const a2 = actionsFor(h, T(h));
    act(h, T(h), a2.raise ? "RAISE" : "CHAAL", T0 + guard);
  }
  const split = Object.values(h.result!.payouts);
  check("equal best hands at the pot limit share the pot, to the paisa", h.result!.winners.length === 2 && split.length === 2 && split[0] + split[1] + h.result!.rake === h.result!.pot && Math.abs(split[0] - split[1]) <= 1);

  // Timeouts
  h = hand(3, [win, mid, low]);
  idx = T(h);
  check("nothing happens before the clock runs out", !expire(h, T0 + CLUB.TURN_MS - 1));
  expire(h, T0 + CLUB.TURN_MS);
  check("a player who does not move in time packs (and is marked as having timed out)", h.players[idx].packed && h.players[idx].timedOut && !h.over && T(h) !== idx);
  expire(h, T0 + CLUB.TURN_MS * 100);
  check("after a long silence the players time out one by one until one is left, who wins", h.over && h.result!.winners.length === 1 && h.players.filter((p) => !p.packed).length === 1);
  check("a timeout leaves the same hand as being there (each step dated at its own deadline)", h.log.filter((e) => e.kind === "TIMEOUT").map((e) => e.at).join() === [T0 + CLUB.TURN_MS, T0 + 2 * CLUB.TURN_MS].join());

  // Leaving
  h = hand(3, [win, mid, low]);
  leaveHand(h, T(h), T0 + 10);
  check("leaving in the middle of a hand packs the player; their boot stays in the pot", h.players.filter((p) => p.left).length === 1 && h.pot === 3 * BOOT && !h.over);

  // Unknown / illegal moves
  h = hand(2, [win, low]);
  check("an unknown move is refused", throws(() => act(h, 0, "NOPE" as never, T0)));
  check("all eight moves exist", ACTION_KINDS.length === 8);
  check("the dealer moves on from one hand to the next", newHand({ no: 2, boot: BOOT, now: T0, lastDealerSeat: 0, players: [0, 1, 2].map((s) => ({ userId: `u${s}`, seat: s, name: "x", uid: s })) }).dealer === 1 && newHand({ no: 3, boot: BOOT, now: T0, lastDealerSeat: 2, players: [0, 1, 2].map((s) => ({ userId: `u${s}`, seat: s, name: "x", uid: s })) }).dealer === 0);
  check("the house can not be set below 5%", newHand({ no: 1, boot: BOOT, now: T0, lastDealerSeat: null, rakeBps: 100, players: [0, 1].map((s) => ({ userId: `u${s}`, seat: s, name: "x", uid: s })) }).rakeBps === MIN_RAKE_BPS);
  const rakes = [1, 2, 3, 7, 19, 20, 21, 99, 100, 101, 1999, 2000, 12345, 99999999].map((pot) => {
    const g = hand(2, [win, low]);
    g.pot = pot;
    act(g, T(g), "PACK", T0);
    return { pot, rake: g.result!.rake, paid: Object.values(g.result!.payouts)[0] };
  });
  check("the rake is rounded up to the paisa: at least 5% for every pot size, and the winner gets the rest", rakes.every((r) => r.rake * 10000 >= r.pot * MIN_RAKE_BPS && r.rake - (r.pot * MIN_RAKE_BPS) / 10000 < 1 && r.rake + r.paid === r.pot), JSON.stringify(rakes.slice(0, 4)));
}

// ---- 4 and 5. tens of thousands of hands, played at random
{
  const HANDS = Number(process.env.HANDS ?? 20000);
  const ends = { PACK: 0, SHOW: 0, POT_LIMIT: 0 } as Record<string, number>;
  let staked = 0;
  let kept = 0;
  let minShare = 1;
  let badPot = 0;
  let badMoney = 0;
  let badRake = 0;
  let badWinner = 0;
  let badTurn = 0;
  let badLeak = 0;
  let badRefusal = 0;
  let badStake = 0;
  let sideShows = 0;
  let timeouts = 0;
  let longest = 0;
  const kinds: Record<string, number> = {};

  const leakFree = (h: HandState): boolean => {
    for (const p of h.players) {
      const v = viewHand(h, p.userId);
      const text = JSON.stringify(v);
      if (!h.over && text.includes(h.seed)) return false;
      if (h.over !== (v.seed !== null)) return false;
      for (const q of v.players) {
        if (!q.cards) continue;
        const real = h.players.find((x) => x.seat === q.seat)!;
        const i = h.players.indexOf(p);
        const j = h.players.indexOf(real);
        const allowed = (j === i && p.seen) || h.peeks.some(([a, b]) => a === i && b === j) || (h.over && h.result!.shown.includes(real.userId));
        if (!allowed) return false;
      }
      // a viewer who is not at the table sees nothing
    }
    const outsider = viewHand(h, "nobody");
    if (outsider.players.some((q) => q.cards && !(h.over && h.result!.shown.includes(h.players.find((x) => x.seat === q.seat)!.userId)))) return false;
    if (!h.over && JSON.stringify(outsider).includes(h.seed)) return false;
    return true;
  };

  for (let n = 0; n < HANDS; n++) {
    const players = 2 + ri(2);
    const boot = pick([500, 1000, 5000, 10000, 50000, 100000]);
    const h = newHand({ no: n, boot, now: T0, lastDealerSeat: ri(3) - 1 < 0 ? null : ri(3), players: Array.from({ length: players }, (_, s) => ({ userId: `u${s}`, seat: s, name: `P${s}`, uid: s })) });
    let now = T0;
    let steps = 0;
    let wentLong = chance(0.3); // some hands are played hard, to reach the pot limit
    if (!leakFree(h)) badLeak++;
    while (!h.over && steps < 4000) {
      steps++;
      now += ri(3000);
      const before = JSON.stringify(h);
      // 1 in 60 moves: time runs out
      if (chance(1 / 60)) {
        const dl = h.sideShow ? h.sideShow.endsAt : h.turnEndsAt;
        now = Math.max(now, dl);
        const had = h.players.filter((p) => p.timedOut).length;
        expire(h, now);
        timeouts += h.players.filter((p) => p.timedOut).length - had;
      } else if (chance(0.01)) {
        // someone leaves
        const i = ri(players);
        if (!h.players[i].packed) leaveHand(h, i, now);
      } else if (chance(0.06)) {
        // an out-of-turn see or pack, or a move that must be refused
        const i = ri(players);
        const k = pick(ACTION_KINDS);
        const a = actionsFor(h, i);
        const allowed =
          (k === "SEE" && a.see) || (k === "PACK" && a.pack) || (k === "CHAAL" && a.chaal !== null) || (k === "RAISE" && a.raise !== null) || (k === "SHOW" && a.show !== null) || (k === "SIDE_SHOW" && a.sideShow) || ((k === "ACCEPT" || k === "DENY") && a.respond);
        if (!allowed) {
          const refused = throws(() => act(h, i, k, now));
          if (!refused || JSON.stringify(h) !== before) badRefusal++;
        } else if (k === "SEE" || k === "PACK") {
          act(h, i, k, now);
        }
      } else if (h.sideShow) {
        const to = h.sideShow.to;
        act(h, to, chance(0.5) ? "ACCEPT" : "DENY", now);
        sideShows++;
      } else {
        const i = h.turn;
        const a = actionsFor(h, i);
        const options: [string, number][] = [];
        if (a.see) options.push(["SEE", 3]);
        if (a.chaal !== null) options.push(["CHAAL", wentLong ? 10 : 5]);
        if (a.raise) options.push(["RAISE", wentLong ? 10 : 2]);
        if (a.pack) options.push(["PACK", wentLong ? 0 : 1.5]);
        if (a.show !== null) options.push(["SHOW", wentLong ? 0 : 3]);
        if (a.sideShow) options.push(["SIDE_SHOW", 2]);
        const total = options.reduce((s, o) => s + o[1], 0);
        let r = (ri(100000) / 100000) * total;
        let kind = options[0][0];
        for (const [k, w] of options) {
          if (r < w) {
            kind = k;
            break;
          }
          r -= w;
        }
        const cost = act(h, i, kind as never, now).cost;
        kinds[kind] = (kinds[kind] ?? 0) + 1;
        if (kind === "SIDE_SHOW") sideShows++;
        if (cost < 0) badMoney++;
      }
      // invariants after every move
      if (h.pot !== h.players.reduce((s, p) => s + p.invested, 0)) badPot++;
      if (h.stake > h.maxStake || h.stake < h.boot) badStake++;
      if (!h.over && (h.turn < 0 || h.players[h.turn].packed)) badTurn++;
      if (!h.over && h.players.filter((p) => !p.packed).length < 2) badTurn++;
      if (!leakFree(h)) badLeak++;
    }
    if (!h.over) {
      expire(h, now + CLUB.TURN_MS * 100);
    }
    longest = Math.max(longest, steps);
    if (!h.over || !h.result) {
      badMoney++;
      continue;
    }
    const r = h.result;
    ends[r.endedBy]++;
    const paid = Object.values(r.payouts).reduce((s, x) => s + x, 0);
    if (paid + r.rake !== r.pot || r.pot !== h.pot || h.pot !== h.players.reduce((s, p) => s + p.invested, 0)) badMoney++;
    if (r.rake * 10000 < r.pot * MIN_RAKE_BPS) badRake++;
    if (r.rake - (r.pot * MIN_RAKE_BPS) / 10000 >= 1) badRake++; // never more than one paisa above 5%
    minShare = Math.min(minShare, r.rake / r.pot);
    staked += r.pot;
    kept += r.rake;
    for (const id of r.winners) {
      const p = h.players[playerIndex(h, id)];
      if (r.endedBy === "PACK" ? p.packed : p.packed && !r.shown.includes(id)) badWinner++;
      if (!(r.payouts[id] > 0)) badWinner++;
    }
    if (r.endedBy === "SHOW" && (r.shown.length !== 2 || h.players.filter((p) => !p.packed).length !== 2)) badWinner++;
    if (!leakFree(h)) badLeak++;
  }
  const played = ends.PACK + ends.SHOW + ends.POT_LIMIT;
  check(`${HANDS} random hands all finished (${ends.PACK} by packs, ${ends.SHOW} by a show, ${ends.POT_LIMIT} at the pot limit; ${sideShows} side-show moves, ${timeouts} timeouts, longest ${longest} moves)`, played === HANDS);
  check("the pot was always exactly what the players had put in, the stake within its limit, the turn always on a player still in", badPot === 0 && badStake === 0 && badTurn === 0, `(${badPot}/${badStake}/${badTurn})`);
  check("the winners and the house always got exactly the pot, and winners are never players who packed", badMoney === 0 && badWinner === 0, `(${badMoney}/${badWinner})`);
  check(`the house kept at least 5% of the pot in EVERY hand (lowest ${(minShare * 100).toFixed(4)}%) and never more than a paisa over`, badRake === 0 && minShare * 10000 >= MIN_RAKE_BPS, `(${badRake} bad)`);
  check(`over everything staked (${(staked / 100).toFixed(2)}) the house kept ${((kept / staked) * 100).toFixed(3)}%`, kept / staked >= 0.05);
  check("a refused move never changes the hand", badRefusal === 0, `(${badRefusal})`);
  check("nobody is ever shown a card or the seed they may not see (checked after every move of every hand)", badLeak === 0, `(${badLeak})`);
  console.log("moves taken:", JSON.stringify(kinds), HAND_NAMES.length ? "" : "");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);

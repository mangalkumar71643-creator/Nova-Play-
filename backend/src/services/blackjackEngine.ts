/**
 * Blackjack against the dealer, unlimited decks (every card is drawn from a
 * full 52-card deck). Rules follow the common online table:
 * - dealer stands on all 17s and peeks for blackjack with an Ace or ten up;
 * - double on any first two cards, also after a split;
 * - split any two cards of the same value once; split Aces get one card each;
 * - insurance is offered when the dealer shows an Ace; no surrender.
 * Payouts are returned stake multiples: a win pays 1.8x, a blackjack 2.2x,
 * insurance 1.9 to 1 (2.9x back) and a push returns the stake.
 *
 * Return to player with perfect play is 89.22% of the first bet (89.89% of
 * everything wagered), worked out exactly over the infinite deck (scratch
 * calculator; the same calculator gives 99.43% for standard 1:1 / 3:2).
 * Insurance on its own returns 4/13 x 2.9 = 89.23%.
 *
 * The engine is pure: cards come from the `draw` passed in, so a hand
 * replays exactly from its card stream.
 */

export const WIN_PAYS = 1.8;
export const BLACKJACK_PAYS = 2.2;
export const INSURANCE_PAYS = 2.9;
export const EXACT_RTP = 0.8922;

/** A card is 0-51: rank = card % 13 (0 = Ace, 1-8 = 2-9, 9 = 10, 10-12 = J Q K), suit = floor(card / 13). */
export type Card = number;

export type Outcome = "BLACKJACK" | "WIN" | "PUSH" | "LOSE" | "BUST";

export type BjHand = {
  cards: Card[];
  stake: number;
  doubled: boolean;
  /** Hands from a split can't be a blackjack and can't split again. */
  fromSplit: boolean;
  done: boolean;
  outcome: Outcome | null;
  payout: number;
};

export type BjPhase = "INSURANCE" | "PLAYER" | "DONE";

export type BjState = {
  phase: BjPhase;
  /** Every card drawn, in stream order (card i came from draw i). */
  drawn: Card[];
  dealer: Card[];
  hands: BjHand[];
  active: number;
  /** Insurance: offered when the dealer shows an Ace; `taken` is null until the player decides. */
  insurance: { offered: boolean; taken: boolean | null; stake: number; payout: number };
  dealerBlackjack: boolean;
};

export type Action = "hit" | "stand" | "double" | "split" | "insurance" | "noInsurance";

export function cardValue(card: Card): number {
  const r = card % 13;
  return r === 0 ? 1 : Math.min(10, r + 1);
}

/** Best total, and whether an Ace is still counted as 11. */
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    total += v;
    if (v === 1) aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function newHand(cards: Card[], stake: number, fromSplit: boolean): BjHand {
  return { cards, stake, doubled: false, fromSplit, done: false, outcome: null, payout: 0 };
}

type Draw = () => Card;

function drawer(state: BjState, cardAt: (i: number) => Card): Draw {
  return () => {
    const c = cardAt(state.drawn.length);
    state.drawn.push(c);
    return c;
  };
}

/** Deals a new hand: player, dealer up card, player, dealer hole card. */
export function deal(stake: number, cardAt: (i: number) => Card): BjState {
  const state: BjState = {
    phase: "PLAYER",
    drawn: [],
    dealer: [],
    hands: [],
    active: 0,
    insurance: { offered: false, taken: null, stake: 0, payout: 0 },
    dealerBlackjack: false,
  };
  const draw = drawer(state, cardAt);
  const p1 = draw();
  const up = draw();
  const p2 = draw();
  const hole = draw();
  state.hands = [newHand([p1, p2], stake, false)];
  state.dealer = [up, hole];
  state.dealerBlackjack = isBlackjack(state.dealer);
  if (cardValue(up) === 1) {
    state.phase = "INSURANCE";
    state.insurance.offered = true;
    return state;
  }
  afterPeek(state, cardAt);
  return state;
}

/** Once insurance is settled (or not offered): end at once on a dealer or player blackjack. */
function afterPeek(state: BjState, cardAt: (i: number) => Card) {
  const hand = state.hands[0];
  if (state.dealerBlackjack || isBlackjack(hand.cards)) {
    hand.done = true;
    finish(state, cardAt);
    return;
  }
  state.phase = "PLAYER";
}

/** Which actions the player can take now. */
export function allowedActions(state: BjState): Action[] {
  if (state.phase === "INSURANCE") return ["insurance", "noInsurance"];
  if (state.phase !== "PLAYER") return [];
  const hand = state.hands[state.active];
  const actions: Action[] = ["hit", "stand"];
  if (hand.cards.length === 2) {
    actions.push("double");
    if (state.hands.length === 1 && cardValue(hand.cards[0]) === cardValue(hand.cards[1])) actions.push("split");
  }
  return actions;
}

/** Extra stake an action takes from the wallet (0 for hit and stand). */
export function extraStake(state: BjState, action: Action): number {
  if (action === "double" || action === "split") return state.hands[state.active].stake;
  if (action === "insurance") return floor2(state.hands[0].stake / 2);
  return 0;
}

function advance(state: BjState, cardAt: (i: number) => Card) {
  while (state.active < state.hands.length && state.hands[state.active].done) state.active++;
  if (state.active >= state.hands.length) {
    state.active = state.hands.length - 1;
    finish(state, cardAt);
  }
}

/** A hand that reaches 21 or busts stops taking cards. */
function autoStop(hand: BjHand) {
  if (handTotal(hand.cards).total >= 21) hand.done = true;
}

/** Applies one action; throws on anything the rules don't allow. */
export function applyAction(state: BjState, action: Action, cardAt: (i: number) => Card): BjState {
  if (!allowedActions(state).includes(action)) throw new Error(`Action ${action} is not allowed now.`);
  const draw = drawer(state, cardAt);

  if (action === "insurance" || action === "noInsurance") {
    const taken = action === "insurance";
    state.insurance.taken = taken;
    state.insurance.stake = taken ? extraStake(state, "insurance") : 0;
    state.insurance.payout = taken && state.dealerBlackjack ? floor2(state.insurance.stake * INSURANCE_PAYS) : 0;
    afterPeek(state, cardAt);
    return state;
  }

  const hand = state.hands[state.active];
  if (action === "hit") {
    hand.cards.push(draw());
    autoStop(hand);
  } else if (action === "stand") {
    hand.done = true;
  } else if (action === "double") {
    hand.stake *= 2;
    hand.doubled = true;
    hand.cards.push(draw());
    hand.done = true;
  } else if (action === "split") {
    const [a, b] = hand.cards;
    const first = newHand([a], hand.stake, true);
    const second = newHand([b], hand.stake, true);
    first.cards.push(draw());
    second.cards.push(draw());
    // Split Aces get one card each and stand.
    if (cardValue(a) === 1) {
      first.done = true;
      second.done = true;
    } else {
      autoStop(first);
      autoStop(second);
    }
    state.hands = [first, second];
    state.active = 0;
  }
  advance(state, cardAt);
  return state;
}

/** Dealer plays (unless every hand is bust or the hand ended on a blackjack) and every hand is settled. */
function finish(state: BjState, cardAt: (i: number) => Card) {
  const draw = drawer(state, cardAt);
  const naturalEnd = state.dealerBlackjack || (state.hands.length === 1 && !state.hands[0].fromSplit && isBlackjack(state.hands[0].cards));
  const anyLive = state.hands.some((h) => handTotal(h.cards).total <= 21);
  if (!naturalEnd && anyLive) {
    while (handTotal(state.dealer).total < 17) state.dealer.push(draw());
  }
  const dealer = handTotal(state.dealer).total;
  for (const hand of state.hands) {
    const total = handTotal(hand.cards).total;
    const natural = !hand.fromSplit && isBlackjack(hand.cards);
    let outcome: Outcome;
    if (total > 21) outcome = "BUST";
    else if (state.dealerBlackjack) outcome = natural ? "PUSH" : "LOSE";
    else if (natural) outcome = "BLACKJACK";
    else if (dealer > 21 || total > dealer) outcome = "WIN";
    else if (total === dealer) outcome = "PUSH";
    else outcome = "LOSE";
    hand.outcome = outcome;
    hand.done = true;
    hand.payout = outcome === "BLACKJACK" ? floor2(hand.stake * BLACKJACK_PAYS) : outcome === "WIN" ? floor2(hand.stake * WIN_PAYS) : outcome === "PUSH" ? hand.stake : 0;
  }
  state.phase = "DONE";
}

/** Everything the hand has staked (bets, doubles, splits, insurance). */
export function totalStaked(state: BjState): number {
  return floor2(state.hands.reduce((s, h) => s + h.stake, 0) + state.insurance.stake);
}

/** Everything the hand pays back. */
export function totalPayout(state: BjState): number {
  return floor2(state.hands.reduce((s, h) => s + h.payout, 0) + state.insurance.payout);
}

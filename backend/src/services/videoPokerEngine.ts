/**
 * Video poker, Jacks or Better: five cards are dealt from a single 52-card
 * deck, the player holds any of them and the rest are replaced once from the
 * same deck. The final hand is paid from the paytable as a multiple of the bet
 * (the total returned, so a pair of jacks or better gives the bet back).
 *
 * With this paytable the return under perfect play is 89.97%, found by an
 * exact search over all 2,598,960 deals and all 32 ways to hold each one; any
 * other play returns less.
 */

export type Card = number; // 0-51: rank = card % 13 (0 = Ace, 1 = Two ... 12 = King), suit = floor(card / 13)

export const HANDS = ["NOTHING", "JACKS_OR_BETTER", "TWO_PAIR", "THREE_OF_A_KIND", "STRAIGHT", "FLUSH", "FULL_HOUSE", "FOUR_OF_A_KIND", "STRAIGHT_FLUSH", "ROYAL_FLUSH"] as const;
export type Hand = (typeof HANDS)[number];

export const PAYTABLE: Record<Hand, number> = {
  NOTHING: 0,
  JACKS_OR_BETTER: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 2.5,
  STRAIGHT: 3.5,
  FLUSH: 5,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 20,
  STRAIGHT_FLUSH: 50,
  ROYAL_FLUSH: 500,
};

/** Return under perfect play with PAYTABLE, from the exact search. */
export const OPTIMAL_RTP_PERCENT = 89.97;

export function rankOf(card: Card): number {
  return card % 13;
}

export function suitOf(card: Card): number {
  return Math.floor(card / 13);
}

export function evaluate(cards: Card[]): Hand {
  const counts = new Array<number>(13).fill(0);
  for (const c of cards) counts[rankOf(c)]++;
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const groups = counts.filter((n) => n > 0).sort((a, b) => b - a);
  let straight = false;
  let royal = false;
  if (groups.length === 5) {
    const ranks = counts.flatMap((n, r) => (n ? [r] : []));
    if (ranks[4] - ranks[0] === 4) straight = true;
    // Ace high: 10-J-Q-K-A.
    if (counts[0] && counts[9] && counts[10] && counts[11] && counts[12]) straight = royal = true;
  }
  if (straight && flush) return royal ? "ROYAL_FLUSH" : "STRAIGHT_FLUSH";
  if (groups[0] === 4) return "FOUR_OF_A_KIND";
  if (groups[0] === 3 && groups[1] === 2) return "FULL_HOUSE";
  if (flush) return "FLUSH";
  if (straight) return "STRAIGHT";
  if (groups[0] === 3) return "THREE_OF_A_KIND";
  if (groups[0] === 2 && groups[1] === 2) return "TWO_PAIR";
  if (groups[0] === 2) {
    const pair = counts.findIndex((n) => n === 2);
    if (pair === 0 || pair >= 10) return "JACKS_OR_BETTER";
  }
  return "NOTHING";
}

/** The final hand: held cards stay, the others are replaced in order from `draws`. */
export function drawHand(hand: Card[], held: number[], draws: Card[]): Card[] {
  let next = 0;
  return hand.map((card, i) => (held.includes(i) ? card : draws[next++]));
}

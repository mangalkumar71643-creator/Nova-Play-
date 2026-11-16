/**
 * Video poker, Jacks or Better: five cards are dealt from a single 52-card
 * deck, the player holds any of them and the rest are replaced once from the
 * same deck. The final hand is paid from the paytable as a multiple of the bet
 * (the total returned, so a pair of jacks or better gives 1.06x the bet).
 *
 * The paytable is the earlier one (return 84.84% under perfect play, found by
 * an exact search over all 2,598,960 deals and all 32 ways to hold each one)
 * with every pay multiplied by 1.06 and rounded down to the cent (owner's
 * request, 2026-11-16: a 10% house edge). Holding costs nothing, so scaling
 * every pay by the same factor keeps each hold's value in the same order:
 * perfect play is unchanged and its return is 1.06 x 84.84% = 89.93%, less
 * at most 0.08% for the rounding down (89.86% to 89.93%). Any other play
 * returns less.
 */

export type Card = number; // 0-51: rank = card % 13 (0 = Ace, 1 = Two ... 12 = King), suit = floor(card / 13)

export const HANDS = ["NOTHING", "JACKS_OR_BETTER", "TWO_PAIR", "THREE_OF_A_KIND", "STRAIGHT", "FLUSH", "FULL_HOUSE", "FOUR_OF_A_KIND", "STRAIGHT_FLUSH", "ROYAL_FLUSH"] as const;
export type Hand = (typeof HANDS)[number];

export const PAYTABLE: Record<Hand, number> = {
  NOTHING: 0,
  JACKS_OR_BETTER: 1.06,
  TWO_PAIR: 2.12,
  THREE_OF_A_KIND: 2.65,
  STRAIGHT: 3.18,
  FLUSH: 4.24,
  FULL_HOUSE: 5.3,
  FOUR_OF_A_KIND: 15.9,
  STRAIGHT_FLUSH: 53,
  ROYAL_FLUSH: 530,
};

/** Return under perfect play with PAYTABLE: between 89.86% and 89.93% (see the top of this file). */
export const OPTIMAL_RTP_PERCENT = 89.9;

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

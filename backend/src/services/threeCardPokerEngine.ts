/**
 * Three Card Poker: poker against the dealer with three cards each. The player
 * antes (and may add a Pair Plus side bet), sees their three cards, then folds
 * (losing the ante) or plays with a Play bet equal to the ante. The dealer
 * needs queen high or better to qualify:
 *   - dealer doesn't qualify: the ante wins, the play bet is returned;
 *   - player's hand is better: ante and play both win;
 *   - hands tie: both bets are returned;
 *   - dealer's hand is better: both bets are lost.
 * A player who plays is also paid the ante bonus for a straight or better,
 * whatever the dealer holds. Pair Plus pays on the player's hand alone, even
 * after a fold.
 */

export type Card = number; // 0-51: rank = card % 13 (0 = Ace, 1 = Two ... 12 = King), suit = floor(card / 13)

// Weakest first. In three-card poker a straight beats a flush and trips beat a straight.
export const HAND_CLASSES = ["HIGH_CARD", "PAIR", "FLUSH", "STRAIGHT", "THREE_OF_A_KIND", "STRAIGHT_FLUSH"] as const;
export type HandClass = (typeof HAND_CLASSES)[number];

export type Evaluated = { score: number; cls: HandClass };

/** Poker value 2-14 with the ace high. */
function valueOf(card: Card): number {
  const r = card % 13;
  return r === 0 ? 14 : r + 1;
}

/**
 * Scores a three-card hand as class x 15^3 + tiebreak, so a higher score is a
 * better hand. A-2-3 is the lowest straight and A-K-Q the highest.
 */
export function score3(cards: Card[]): Evaluated {
  const [a, b, c] = cards.map(valueOf).sort((x, y) => y - x);
  const flush = cards.every((card) => Math.floor(card / 13) === Math.floor(cards[0] / 13));
  let straightTop = 0;
  if (a === b + 1 && b === c + 1) straightTop = a;
  else if (a === 14 && b === 3 && c === 2) straightTop = 3;
  let cls: number;
  let tiebreak: number;
  if (straightTop && flush) {
    cls = 5;
    tiebreak = straightTop;
  } else if (a === c) {
    cls = 4;
    tiebreak = a;
  } else if (straightTop) {
    cls = 3;
    tiebreak = straightTop;
  } else if (flush) {
    cls = 2;
    tiebreak = a * 225 + b * 15 + c;
  } else if (a === b || b === c) {
    cls = 1;
    tiebreak = b * 15 + (a === b ? c : a); // the pair, then the odd card
  } else {
    cls = 0;
    tiebreak = a * 225 + b * 15 + c;
  }
  return { score: cls * 3375 + tiebreak, cls: HAND_CLASSES[cls] };
}

/** The dealer plays with queen high or better. */
export function qualifies(dealer: Evaluated): boolean {
  return dealer.score >= 12 * 225;
}

export type Outcome = "FOLD" | "DEALER_NOT_QUALIFIED" | "WIN" | "TIE" | "LOSE";

/**
 * Settles a hand the player played. `returnAntes` is what comes back, in
 * antes, on the ante and play bets together (each staked one ante), ante bonus
 * included.
 */
export function settle(
  player: Evaluated,
  dealer: Evaluated,
  antePays: number,
  playPays: number,
  anteBonus: Record<HandClass, number>
): { outcome: Outcome; returnAntes: number } {
  const bonus = anteBonus[player.cls];
  if (!qualifies(dealer)) return { outcome: "DEALER_NOT_QUALIFIED", returnAntes: 1 + antePays + 1 + bonus };
  if (player.score > dealer.score) return { outcome: "WIN", returnAntes: 1 + antePays + 1 + playPays + bonus };
  if (player.score === dealer.score) return { outcome: "TIE", returnAntes: 2 + bonus };
  return { outcome: "LOSE", returnAntes: bonus };
}

/** What comes back on the Pair Plus bet, in units of that bet. */
export function pairPlusReturn(player: Evaluated, pairPlusPays: Record<HandClass, number>): number {
  const pays = pairPlusPays[player.cls];
  return pays > 0 ? 1 + pays : 0;
}

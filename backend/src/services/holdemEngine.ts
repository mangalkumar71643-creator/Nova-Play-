/**
 * Casino Hold'em: poker against the dealer. The player antes and gets two
 * cards, and three community cards (the flop) are shown. The player then
 * folds (losing the ante) or calls with twice the ante. On a call the turn
 * and river complete the board, the dealer's two cards are shown, and both
 * make their best five-card hand from their two cards and the five on the
 * board. The dealer needs a pair of fours or better to qualify:
 *   - dealer doesn't qualify: the ante is paid from the ante paytable, the call is returned;
 *   - player's hand is better: the ante is paid from the paytable and the call wins;
 *   - hands tie: both bets are returned;
 *   - dealer's hand is better: both bets are lost.
 */

export type Card = number; // 0-51: rank = card % 13 (0 = Ace, 1 = Two ... 12 = King), suit = floor(card / 13)

export const HAND_CLASSES = ["HIGH_CARD", "PAIR", "TWO_PAIR", "THREE_OF_A_KIND", "STRAIGHT", "FLUSH", "FULL_HOUSE", "FOUR_OF_A_KIND", "STRAIGHT_FLUSH", "ROYAL_FLUSH"] as const;
export type HandClass = (typeof HAND_CLASSES)[number];

export type Evaluated = { score: number; cls: HandClass; best: Card[] };

/** Poker value 2-14 with the ace high. */
export function valueOf(card: Card): number {
  const r = card % 13;
  return r === 0 ? 14 : r + 1;
}

/** Scores a five-card hand: class x 16^5 + tiebreak values, so a higher score is a better hand. */
export function score5(cards: Card[]): { score: number; cls: HandClass } {
  const values = cards.map(valueOf).sort((a, b) => b - a);
  const flush = cards.every((c) => Math.floor(c / 13) === Math.floor(cards[0] / 13));
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Values ordered by how many there are, then by value.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let straightTop = 0;
  if (counts.size === 5) {
    if (values[0] - values[4] === 4) straightTop = values[0];
    else if (values[0] === 14 && values[1] === 5) straightTop = 5; // A-2-3-4-5
  }
  const pack = (cls: number, vals: number[]) => vals.reduce((s, v) => s * 16 + v, cls) * 16 ** (5 - vals.length);
  let cls: number;
  let tiebreak: number[];
  if (straightTop && flush) {
    cls = straightTop === 14 ? 9 : 8;
    tiebreak = [straightTop];
  } else if (groups[0][1] === 4) {
    cls = 7;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    cls = 6;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (flush) {
    cls = 5;
    tiebreak = values;
  } else if (straightTop) {
    cls = 4;
    tiebreak = [straightTop];
  } else if (groups[0][1] === 3) {
    cls = 3;
    tiebreak = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    cls = 2;
    tiebreak = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2) {
    cls = 1;
    tiebreak = groups.map((g) => g[0]);
  } else {
    cls = 0;
    tiebreak = values;
  }
  // A royal flush ranks with straight flushes (class 8) when comparing hands.
  return { score: pack(cls === 9 ? 8 : cls, tiebreak), cls: HAND_CLASSES[cls] };
}

/** The best five of seven cards. */
export function best5(cards: Card[]): Evaluated {
  let top: Evaluated | null = null;
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) {
      const hand = cards.filter((_, i) => i !== a && i !== b);
      const { score, cls } = score5(hand);
      if (!top || score > top.score) top = { score, cls, best: hand };
    }
  return top!;
}

/** The dealer qualifies with a pair of fours or better. */
export function qualifies(e: Evaluated): boolean {
  if (e.cls === "HIGH_CARD") return false;
  if (e.cls !== "PAIR") return true;
  const counts = new Map<number, number>();
  for (const c of e.best) counts.set(valueOf(c), (counts.get(valueOf(c)) ?? 0) + 1);
  const pair = [...counts.entries()].find(([, n]) => n === 2)![0];
  return pair >= 4;
}

export type Outcome = "FOLD" | "DEALER_NOT_QUALIFIED" | "WIN" | "TIE" | "LOSE";

/**
 * What a called hand returns, as multiples of the ante (the call is 2 antes):
 * the stakes back plus winnings, before the payout cap.
 */
export function settle(player: Evaluated, dealer: Evaluated, antePays: Record<HandClass, number>, callPays: number): { outcome: Outcome; returnAntes: number } {
  if (!qualifies(dealer)) return { outcome: "DEALER_NOT_QUALIFIED", returnAntes: 1 + antePays[player.cls] + 2 };
  if (player.score > dealer.score) return { outcome: "WIN", returnAntes: 1 + antePays[player.cls] + 2 * (1 + callPays) };
  if (player.score === dealer.score) return { outcome: "TIE", returnAntes: 3 };
  return { outcome: "LOSE", returnAntes: 0 };
}

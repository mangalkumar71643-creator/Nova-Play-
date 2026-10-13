/**
 * Hi-Lo: a card is shown and the player guesses whether the next one is
 * higher or lower. Cards run Ace (lowest) to King (highest) and come from an
 * unlimited deck, so every rank is 1/13. On 2-Q the choices are "higher or
 * same" and "lower or same"; on an Ace they are "higher" and "same", on a
 * King "lower" and "same". The player can skip a card (up to MAX_SKIPS per
 * round) and cash out after at least one right guess.
 *
 * The cash-out multiplier is rtp x the product of 1/chance over the right
 * guesses. The house edge is taken once, not per guess, so every way of
 * playing — how many guesses, which ones, when to stop — returns exactly the
 * rtp before rounding down and the payout cap.
 */

export type Card = number; // 0-51: rank = card % 13 (0 = Ace ... 12 = King), suit = floor(card / 13)
export type Choice = "HIGHER" | "LOWER" | "SAME";
export type StepAction = "START" | "SKIP" | Choice;

export const MAX_SKIPS = 52;

export type HiloStep = { card: Card; action: StepAction; correct: boolean | null };

export type HiloState = {
  /** Every card drawn, in stream order; the last is the card in play. */
  steps: HiloStep[];
  /** Product of 1/chance over the right guesses. */
  raw: number;
  wins: number;
  skips: number;
};

export function rankOf(card: Card): number {
  return card % 13;
}

/** The two choices offered on a card. */
export function choicesFor(card: Card): [Choice, Choice] {
  const r = rankOf(card);
  if (r === 0) return ["HIGHER", "SAME"];
  if (r === 12) return ["LOWER", "SAME"];
  return ["HIGHER", "LOWER"];
}

/** Chance a choice wins on this card (in 13ths of the unlimited deck). */
export function chanceOf(card: Card, choice: Choice): number {
  const r = rankOf(card);
  if (!choicesFor(card).includes(choice)) return 0;
  if (choice === "SAME") return 1 / 13;
  if (r === 0) return 12 / 13; // strictly higher than an Ace
  if (r === 12) return 12 / 13; // strictly lower than a King
  return choice === "HIGHER" ? (13 - r) / 13 : (r + 1) / 13;
}

export function wins(current: Card, next: Card, choice: Choice): boolean {
  const a = rankOf(current);
  const b = rankOf(next);
  if (choice === "SAME") return a === b;
  if (a === 0) return choice === "HIGHER" && b > 0;
  if (a === 12) return choice === "LOWER" && b < 12;
  return choice === "HIGHER" ? b >= a : b <= a;
}

export function start(cardAt: (i: number) => Card): HiloState {
  return { steps: [{ card: cardAt(0), action: "START", correct: null }], raw: 1, wins: 0, skips: 0 };
}

export function current(state: HiloState): Card {
  return state.steps[state.steps.length - 1].card;
}

/** Draws the next card for a guess or a skip; returns whether the guess was right (skips are always "right"). */
export function play(state: HiloState, action: Choice | "SKIP", cardAt: (i: number) => Card): boolean {
  const before = current(state);
  if (action === "SKIP") {
    if (state.skips >= MAX_SKIPS) throw new Error("No skips left this round.");
    state.skips++;
    state.steps.push({ card: cardAt(state.steps.length), action: "SKIP", correct: null });
    return true;
  }
  const p = chanceOf(before, action);
  if (p === 0) throw new Error(`${action} is not a choice on this card.`);
  const next = cardAt(state.steps.length);
  const right = wins(before, next, action);
  state.steps.push({ card: next, action, correct: right });
  if (right) {
    state.raw *= 1 / p;
    state.wins++;
  }
  return right;
}

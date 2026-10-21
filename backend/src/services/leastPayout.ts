import { ApiError } from "../middleware/errorHandler";

/**
 * The least-payout rule for the shared-round lottery games (K3, 5D, Jhandi
 * Munda; env.games.lotteryLeastPayout, shown in each game's How to play):
 * once betting has closed, the result is the outcome that pays the least
 * in total on every player's bets. Ties go to `draw`, a number in [0, 1)
 * from the round's own seed (or block), so every settler of a round picks
 * the same outcome from the same bets. Trx Win Go follows Win Go's
 * least-staked rule (winGoService.leastStakedNumber) under the same switch.
 */
export function leastPayoutOutcome<T>(outcomes: T[], payoutOf: (o: T) => number, draw: number): T {
  let least = Infinity;
  let tied: T[] = [];
  for (const o of outcomes) {
    // Cents, so float noise can't split a real tie.
    const p = Math.round(payoutOf(o) * 100);
    if (p < least) {
      least = p;
      tied = [o];
    } else if (p === least) {
      tied.push(o);
    }
  }
  return tied[Math.floor(draw * tied.length)];
}

/** Total staked per bet key. */
export function stakedByKey(bets: { area: string; amount: unknown }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bets) m.set(b.area, (m.get(b.area) ?? 0) + Number(b.amount));
  return m;
}

/** First app version whose rules text states the least-payout rule. */
export const LEAST_PAYOUT_MIN_APP = [1, 0, 25];
/** Same for the shared-table games (env.games.tableLeastPayout). */
export const TABLE_LEAST_PAYOUT_MIN_APP = [1, 0, 26];

/** Turns away bets from apps that don't show the table rule yet. */
export function assertTableAppShowsRules(appVersion: string | undefined, enabled: boolean) {
  if (enabled) assertAppAtLeast(appVersion, TABLE_LEAST_PAYOUT_MIN_APP);
}

/**
 * For card games, whose deals are too many to list but whose bets only
 * depend on a few kinds of result (Teen Patti: A / B / tie; Baccarat:
 * winner and pairs): picks the kind that pays the least (ties to `draw`),
 * then deals from the round's seed (nonce 0, 1, 2, ...) until a deal of
 * that kind comes up. Should none within `maxTries` (only a kind too rare
 * to matter), the cheapest kind that did come up is used.
 */
export function leastPayoutByKind<K, T>(
  kinds: K[],
  payoutOf: (kind: K) => number,
  draw: number,
  deal: (nonce: number) => T,
  kindOf: (d: T) => K,
  maxTries = 200000
): T {
  const target = leastPayoutOutcome(kinds, payoutOf, draw);
  const seen = new Map<K, T>();
  for (let n = 0; n < maxTries; n++) {
    const d = deal(n);
    const k = kindOf(d);
    if (k === target) return d;
    if (!seen.has(k)) seen.set(k, d);
  }
  return seen.get(leastPayoutOutcome([...seen.keys()], payoutOf, draw))!;
}

/** Turns away a bet from an app older than `min` (or one that sends no
 * X-App-Version): its rules text still describes a random draw. */
export function assertAppAtLeast(appVersion: string | undefined, min: number[]) {
  const v = (appVersion ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < min.length; i++) {
    if ((v[i] ?? 0) > min[i]) return;
    if ((v[i] ?? 0) < min[i]) {
      throw new ApiError(426, "This game's rules have changed. Please update NovaPlay to the latest version to play.");
    }
  }
}

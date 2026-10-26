/**
 * The server's "no limit" on what a bet can win (NO_PAYOUT_LIMIT in the
 * backend's env.ts): the largest payout its money columns can hold. A
 * limit at or above it is shown as "unlimited".
 */
export const NO_LIMIT = 9_999_999_999;

/** "unlimited", or the limit in rupees, for a game's rules text. */
export function winLimit(n?: number | null): string {
  if (n == null || n >= NO_LIMIT) return 'unlimited';
  return `₹${n.toLocaleString('en-IN')}`;
}

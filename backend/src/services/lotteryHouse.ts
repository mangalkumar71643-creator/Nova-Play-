import { fairGameFloat } from "../utils/rng";

/**
 * The lottery games' House result, an open rule shown in every lottery
 * game's rules: one round (or ticket) in ten is a ⭐ House result, on which
 * every bet loses. Everything else pays fair odds — the multiplier is 1 /
 * the chance of winning when the result is not House (Big/Small 2x, a
 * number 10x) — so each bet returns at most 90% (a 10% house edge). With
 * Win Go's ten numbers that makes each number 9% and Big or Small 45%.
 *
 * Whether a round is House is drawn from the round's own server seed (or
 * the ticket's seeds) with its own HMAC message, independent of the
 * numbers or dice drawn, so it is just as verifiable once the seed is
 * revealed. Trx Win Go takes it from the TRON block instead (houseFromBlockHash).
 * It is fixed when the round is created and stored on it: rounds created
 * before the rule existed are never House. (A Trx round is marked houseRule
 * when created, and only such a round can turn House once its block is read.)
 */
export const HOUSE_CHANCE = 0.1;
/** Return of every lottery bet: fair odds on the 90% of results that are not House. */
export const LOTTERY_RTP = 1 - HOUSE_CHANCE;

/** Round-based games (Win Go, K3, 5D, Jhandi Munda): drawn from the round's seed and period number. */
export function isHouseRound(serverSeed: string, periodNumber: string): boolean {
  return fairGameFloat(serverSeed, periodNumber, "house", 0) < HOUSE_CHANCE;
}

/** Per-ticket games (Fortune Six): drawn from the ticket's seeds and nonce. */
export function isHouseTicket(serverSeed: string, clientSeed: string, game: string, nonce: number): boolean {
  return fairGameFloat(serverSeed, clientSeed, `${game}:house`, nonce) < HOUSE_CHANCE;
}

/**
 * Trx Win Go: House when the second-last decimal digit of the block hash is
 * 0 (1 in 10). The result number is the last decimal digit (tronBlocks.ts
 * lastDigitOf), so the two never use the same character.
 */
export function houseFromBlockHash(hash: string): boolean {
  let seen = 0;
  for (let i = hash.length - 1; i >= 0; i--) {
    const c = hash.charCodeAt(i);
    if (c >= 48 && c <= 57 && ++seen === 2) return c === 48;
  }
  return false;
}

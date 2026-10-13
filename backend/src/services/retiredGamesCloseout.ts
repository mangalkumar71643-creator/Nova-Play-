import { prisma } from "../db/prismaClient";
import { fairRandomFloat } from "../utils/rng";

/**
 * Close-out for games that have been retired (their endpoints are gone, so
 * nothing else would ever settle a bet still open on them). Idempotent:
 * every bet is claimed with a guarded PENDING update, so running this on
 * every cold start can never pay anything twice.
 */
export async function closeOutRetiredGames() {
  const colorRounds = await closeOutLegacyColorGame();
  const sportsBets = await refundOpenSportsbookBets();
  return { colorRounds, sportsBets };
}

/**
 * The original Win Go ("color game") has been retired in favour of the
 * rebuilt /wingo game. Its endpoints are gone, so nothing would ever settle
 * a bet still open on it. This closes those bets out fairly, once:
 *
 *  - a round that has already ended is settled exactly as the old game
 *    would have: the number comes from the round's own server seed, and the
 *    old fixed odds apply (number 9x, big/small 1.8x, violet 4.5x, green /
 *    red 1.9x, or 1.4x on the shared violet number);
 *  - a bet on a round that has not ended yet can no longer be decided, so
 *    its stake is refunded.
 *
 * Every bet is claimed with a guarded PENDING -> WON/LOST/VOID update, so
 * running this again (every cold start does) can never pay anything twice.
 */
const PAYOUTS = { number: 9, size: 1.8, violet: 4.5, color: 1.9, colorMixed: 1.4 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function oldPayoutMultiplier(betType: string, betValue: string, n: number): number {
  if (betType === "NUMBER") return Number(betValue) === n ? PAYOUTS.number : 0;
  if (betType === "SIZE") return (n >= 5 ? "BIG" : "SMALL") === betValue ? PAYOUTS.size : 0;
  if (betValue === "VIOLET") return n === 0 || n === 5 ? PAYOUTS.violet : 0;
  if (betValue === "GREEN") return n === 5 ? PAYOUTS.colorMixed : [1, 3, 7, 9].includes(n) ? PAYOUTS.color : 0;
  if (betValue === "RED") return n === 0 ? PAYOUTS.colorMixed : [2, 4, 6, 8].includes(n) ? PAYOUTS.color : 0;
  return 0;
}

async function closeOutLegacyColorGame() {
  const now = new Date();
  const rounds = await prisma.colorGameRound.findMany({ where: { settled: false } });
  for (const round of rounds) {
    const ended = round.endTime <= now && !!round.serverSeed;
    const resultNumber = ended ? Math.min(9, Math.floor(fairRandomFloat(round.serverSeed!, round.periodNumber, 0) * 10)) : null;
    const pending = await prisma.colorGameBet.findMany({ where: { roundId: round.id, status: "PENDING" } });
    for (const bet of pending) {
      const amount = Number(bet.amount);
      await prisma.$transaction(async (tx) => {
        if (resultNumber === null) {
          const claimed = await tx.colorGameBet.updateMany({ where: { id: bet.id, status: "PENDING" }, data: { status: "VOID" } });
          if (claimed.count === 0) return;
          await tx.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: amount } } });
          await tx.transaction.create({ data: { userId: bet.userId, type: "BET_REFUND", amount, status: "COMPLETED" } });
          return;
        }
        const rate = oldPayoutMultiplier(bet.betType, bet.betValue, resultNumber);
        const payout = rate > 0 ? round2(amount * rate) : 0;
        const claimed = await tx.colorGameBet.updateMany({
          where: { id: bet.id, status: "PENDING" },
          data: { status: rate > 0 ? "WON" : "LOST", payout, payoutMultiplier: rate },
        });
        if (claimed.count === 0 || payout === 0) return;
        await tx.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: payout } } });
        await tx.transaction.create({ data: { userId: bet.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
      });
    }
    await prisma.colorGameRound.updateMany({
      where: { id: round.id, settled: false },
      data: resultNumber === null ? { settled: true } : { settled: true, resultNumber, resultSize: resultNumber >= 5 ? "BIG" : "SMALL" },
    });
  }
  return rounds.length;
}

/**
 * The sportsbook never had a screen in the app and has been retired. A bet
 * still open on it can no longer be decided, so its stake is refunded.
 */
async function refundOpenSportsbookBets() {
  const open = await prisma.bet.findMany({ where: { status: "PENDING" } });
  for (const bet of open) {
    const stake = Number(bet.stake);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.bet.updateMany({ where: { id: bet.id, status: "PENDING" }, data: { status: "VOID", settledAt: new Date() } });
      if (claimed.count === 0) return;
      await tx.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: stake } } });
      await tx.transaction.create({ data: { userId: bet.userId, type: "BET_REFUND", amount: stake, status: "COMPLETED", betId: bet.id } });
    });
  }
  return open.length;
}

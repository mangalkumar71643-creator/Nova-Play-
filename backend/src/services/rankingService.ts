import { prisma } from "../db/prismaClient";

const ROLLING_DAYS = 7;
const TOP_COUNT = 20;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type RankingPeriod = "day" | "week" | "month";
export const RANKING_PERIODS: RankingPeriod[] = ["day", "week", "month"];

/** "87014997" → "870***97": enough to recognise yourself, not to look anyone up. */
function maskUid(uid: number | null) {
  if (uid == null) return "Player";
  const s = String(uid);
  return s.length <= 5 ? `${s.slice(0, 1)}***` : `${s.slice(0, 3)}***${s.slice(-2)}`;
}

/** Today, this week (from Monday) or this month, in India time: when it began and when it ends. */
function periodWindow(period: RankingPeriod, now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS); // its UTC fields are the India date
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const istMidnight = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd) - IST_OFFSET_MS);
  if (period === "day") return { since: istMidnight(y, m, d), endsAt: istMidnight(y, m, d + 1) };
  if (period === "week") {
    const back = (ist.getUTCDay() + 6) % 7; // days since Monday
    return { since: istMidnight(y, m, d - back), endsAt: istMidnight(y, m, d - back + 7) };
  }
  return { since: istMidnight(y, m, 1), endsAt: istMidnight(y, m + 1, 1) };
}

/**
 * Players ranked by what they won in games: today, this week or this month (India time), each list starting
 * again when its period ends. With no period (older apps) it is the last 7 days, as before.
 * `totalWon` is what all players together won in the period.
 */
export async function getRanking(userId: string, period?: RankingPeriod) {
  const now = new Date();
  const window = period ? periodWindow(period, now) : { since: new Date(now.getTime() - ROLLING_DAYS * 24 * 60 * 60 * 1000), endsAt: null };
  const rows = await prisma.$queryRaw<{ userId: string; uid: number | null; won: number }[]>`
    SELECT t."userId", u.uid, SUM(t.amount)::float8 AS won
    FROM "Transaction" t JOIN "User" u ON u.id = t."userId"
    WHERE t.type IN ('GAME_PAYOUT', 'BET_PAYOUT') AND t.status = 'COMPLETED' AND t."createdAt" >= ${window.since}
      AND u.role = 'USER'
    GROUP BY t."userId", u.uid
    ORDER BY won DESC, t."userId"`;
  const myIndex = rows.findIndex((r) => r.userId === userId);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    period: period ?? null,
    periodDays: period === "day" ? 1 : period === "month" ? 30 : ROLLING_DAYS,
    endsAt: window.endsAt,
    totalWon: round2(rows.reduce((s, r) => s + r.won, 0)),
    top: rows.slice(0, TOP_COUNT).map((r, i) => ({ rank: i + 1, name: `Player${maskUid(r.uid)}`, won: round2(r.won), isMe: r.userId === userId })),
    me: myIndex >= 0 ? { rank: myIndex + 1, won: round2(rows[myIndex].won) } : { rank: null, won: 0 },
    players: rows.length,
  };
}

import { prisma } from "../db/prismaClient";

const PERIOD_DAYS = 7;
const TOP_COUNT = 20;

/** "87014997" → "870***97": enough to recognise yourself, not to look anyone up. */
function maskUid(uid: number | null) {
  if (uid == null) return "Player";
  const s = String(uid);
  return s.length <= 5 ? `${s.slice(0, 1)}***` : `${s.slice(0, 3)}***${s.slice(-2)}`;
}

/** Players ranked by what they won in games over the last 7 days. */
export async function getRanking(userId: string) {
  const since = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ userId: string; uid: number | null; won: number }[]>`
    SELECT t."userId", u.uid, SUM(t.amount)::float8 AS won
    FROM "Transaction" t JOIN "User" u ON u.id = t."userId"
    WHERE t.type IN ('GAME_PAYOUT', 'BET_PAYOUT') AND t.status = 'COMPLETED' AND t."createdAt" >= ${since}
      AND u.role = 'USER'
    GROUP BY t."userId", u.uid
    ORDER BY won DESC, t."userId"`;
  const myIndex = rows.findIndex((r) => r.userId === userId);
  return {
    periodDays: PERIOD_DAYS,
    top: rows.slice(0, TOP_COUNT).map((r, i) => ({ rank: i + 1, name: `Player${maskUid(r.uid)}`, won: Math.round(r.won * 100) / 100, isMe: r.userId === userId })),
    me: myIndex >= 0 ? { rank: myIndex + 1, won: Math.round(rows[myIndex].won * 100) / 100 } : { rank: null, won: 0 },
    players: rows.length,
  };
}

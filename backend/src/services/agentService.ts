import { AgentRewardKind, Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * The agent (referral) program. A player's invite code is their uid; whoever
 * signs up with it becomes their level-1 subordinate, that player's invitees
 * level 2, and so on down to level 6 (AgentLink holds every pair).
 *
 *  - Joining reward: once an invitee has deposited ₹200 and staked 3x that,
 *    the inviter earns ₹80 and the invitee ₹20 (at most 99 a day per inviter).
 *  - Cumulative invitations (Task): bonuses at 3, 5, 10, 15 and 20 such invitees.
 *  - Rebate (Bet): a % of the bets of level 1-3 subordinates each day, and
 *    Top up (Deposit): a % of level-1 subordinates' deposits each day, both
 *    set by the agent's team level that day (team size and team betting).
 *  - Agent Jackpot: each week 1% of the bets of players invited that week
 *    (plus what the last week left over) goes to the top 100 agents by
 *    commission earned that week (₹30 minimum to take part).
 *
 * Rewards wait in AgentReward until the agent claims them into the balance,
 * as a BONUS that must be played once before it can be withdrawn. Days and
 * weeks are settled lazily (runAgentSweep), each exactly once.
 *
 * Money from StockPay TEST deposits is play money: players who have any are
 * left out of every calculation here.
 */
export const AGENT = {
  maxDepth: 6,
  teamLevels: [
    { level: 0, teamSize: 1, teamBetting: 100 },
    { level: 1, teamSize: 5, teamBetting: 200_000 },
    { level: 2, teamSize: 30, teamBetting: 2_000_000 },
    { level: 3, teamSize: 100, teamBetting: 20_000_000 },
  ],
  /** % of each subordinate level's (1-6) bets that day, by team level. */
  betRebate: [
    [0.2, 0.1, 0.04, 0, 0, 0],
    [0.3, 0.15, 0.08, 0, 0, 0],
    [0.45, 0.17, 0.08, 0, 0, 0],
    [0.6, 0.22, 0.12, 0, 0, 0],
  ],
  /** % of level-1 subordinates' deposits that day, by team level. */
  topUpRebate: [0.25, 0.5, 1, 1.5],
  join: { inviterReward: 80, inviteeReward: 20, minDeposit: 200, wagerMultiple: 3, dailyCap: 99 },
  milestones: [
    { count: 3, reward: 30 },
    { count: 5, reward: 120 },
    { count: 10, reward: 144 },
    { count: 15, reward: 180 },
    { count: 20, reward: 540 },
  ],
  jackpot: {
    poolPercent: 1,
    minCommission: 30,
    /** % of the pool by rank; a range is shared equally by its ranks. */
    prizes: [
      { from: 1, to: 1, percent: 18 },
      { from: 2, to: 2, percent: 12 },
      { from: 3, to: 3, percent: 8 },
      { from: 4, to: 4, percent: 3 },
      { from: 5, to: 5, percent: 2.4 },
      { from: 6, to: 6, percent: 2.2 },
      { from: 7, to: 7, percent: 2 },
      { from: 8, to: 8, percent: 1.8 },
      { from: 9, to: 9, percent: 1.7 },
      { from: 10, to: 10, percent: 1.6 },
      { from: 11, to: 20, percent: 13.25 },
      { from: 21, to: 50, percent: 20.55 },
      { from: 51, to: 100, percent: 13.5 },
    ],
  },
};

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A day or week is settled this long after it ends, so late-confirmed deposits land in it. */
const SETTLE_GRACE_MS = 60 * 60 * 1000;
const LAUNCH_KEY = "agentLaunchDay";
const STAKE_TYPES = Prisma.sql`('GAME_STAKE', 'BET_STAKE')`;
const TEST_PROVIDER = "stockpay";

const dayKeyOf = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const dayStart = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - IST_MS);
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
function weekKeyOf(key: string) {
  const back = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(key, -back);
}
const paise = (n: number) => Math.floor(n * 100 + 1e-6) / 100;
const playerName = (uid: number | null) => (uid ? `Player${uid}` : "Player");

/** Players whose money includes StockPay test (play) deposits. */
const notTestMoney = (userCol: Prisma.Sql) =>
  Prisma.sql`NOT EXISTS (SELECT 1 FROM "Transaction" x WHERE x."userId" = ${userCol} AND x.type = 'DEPOSIT' AND x.provider = ${TEST_PROVIDER} AND x.status = 'COMPLETED')`;

export function teamLevelFor(size: number, betting: number) {
  let level = 0;
  for (const t of AGENT.teamLevels) if (size >= t.teamSize && betting >= t.teamBetting) level = t.level;
  return level;
}

/** The prize share (% of the pool) for one rank, or 0 past the last prize. */
export function jackpotShare(rank: number) {
  const p = AGENT.jackpot.prizes.find((x) => rank >= x.from && rank <= x.to);
  return p ? p.percent / (p.to - p.from + 1) : 0;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Team size and team betting (all subordinates, all-time) of the given agents, as of `before`. */
async function teamStats(db: Db, ids: string[], before: Date) {
  if (ids.length === 0) return new Map<string, { size: number; betting: number }>();
  const rows = await db.$queryRaw<{ id: string; size: number; betting: number }[]>`
    SELECT l."ancestorId" AS id, COUNT(DISTINCT l."descendantId")::int AS size, COALESCE(SUM(t.amount), 0)::float8 AS betting
    FROM "AgentLink" l
    LEFT JOIN "Transaction" t ON t."userId" = l."descendantId" AND t.type IN ${STAKE_TYPES} AND t.status = 'COMPLETED' AND t."createdAt" < ${before}
      AND ${notTestMoney(Prisma.sql`t."userId"`)}
    WHERE l."createdAt" < ${before} AND l."ancestorId" = ANY(${ids})
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.id, { size: r.size, betting: r.betting }]));
}

/** Claims a settlement key; false when another run already settled it. */
async function claimSettlement(tx: Prisma.TransactionClient, key: string) {
  const rows = await tx.$queryRaw<{ key: string }[]>`
    INSERT INTO "AgentSettlement" (key, "createdAt") VALUES (${key}, now()) ON CONFLICT DO NOTHING RETURNING key`;
  return rows.length > 0;
}

/** Pays the Bet and Deposit rebates for one finished day. */
async function settleDay(key: string) {
  const start = dayStart(key);
  const end = dayStart(addDays(key, 1));
  await prisma.$transaction(
    async (tx) => {
      if (!(await claimSettlement(tx, `day:${key}`))) return;
      const bets = await tx.$queryRaw<{ a: string; depth: number; amount: number; n: number }[]>`
        SELECT l."ancestorId" AS a, l.depth, SUM(t.amount)::float8 AS amount, COUNT(DISTINCT t."userId")::int AS n
        FROM "AgentLink" l JOIN "Transaction" t ON t."userId" = l."descendantId"
        WHERE l.depth <= 3 AND t.type IN ${STAKE_TYPES} AND t.status = 'COMPLETED'
          AND t."createdAt" >= ${start} AND t."createdAt" < ${end} AND ${notTestMoney(Prisma.sql`t."userId"`)}
        GROUP BY 1, 2`;
      const deposits = await tx.$queryRaw<{ a: string; amount: number; n: number }[]>`
        SELECT l."ancestorId" AS a, SUM(t.amount)::float8 AS amount, COUNT(DISTINCT t."userId")::int AS n
        FROM "AgentLink" l JOIN "Transaction" t ON t."userId" = l."descendantId"
        WHERE l.depth = 1 AND t.type = 'DEPOSIT' AND t.status = 'COMPLETED' AND t.provider IS DISTINCT FROM ${TEST_PROVIDER}
          AND t."createdAt" >= ${start} AND t."createdAt" < ${end} AND ${notTestMoney(Prisma.sql`t."userId"`)}
        GROUP BY 1`;
      const agents = [...new Set([...bets.map((b) => b.a), ...deposits.map((d) => d.a)])];
      const stats = await teamStats(tx, agents, end);
      const rows: Prisma.AgentRewardCreateManyInput[] = [];
      for (const a of agents) {
        const s = stats.get(a) ?? { size: 0, betting: 0 };
        const level = teamLevelFor(s.size, s.betting);
        const mine = bets.filter((b) => b.a === a);
        const bet = paise(mine.reduce((sum, b) => sum + (b.amount * (AGENT.betRebate[level][b.depth - 1] ?? 0)) / 100, 0));
        if (bet >= 0.01) {
          rows.push({ userId: a, kind: "BET", periodKey: key, amount: bet, invitees: mine.reduce((n, b) => n + b.n, 0), earnedAt: start });
        }
        const dep = deposits.find((d) => d.a === a);
        const topUp = dep ? paise((dep.amount * AGENT.topUpRebate[level]) / 100) : 0;
        if (dep && topUp >= 0.01) {
          rows.push({ userId: a, kind: "DEPOSIT", periodKey: key, amount: topUp, invitees: dep.n, earnedAt: start });
        }
      }
      if (rows.length) await tx.agentReward.createMany({ data: rows, skipDuplicates: true });
    },
    { timeout: 30_000 }
  );
}

/** Joining rewards (and the cumulative-invitation tasks they unlock) for invitees who now qualify. */
async function qualifyInvites() {
  const { minDeposit, wagerMultiple, dailyCap, inviterReward, inviteeReward } = AGENT.join;
  const candidates = await prisma.$queryRaw<{ id: string; referrerId: string }[]>`
    SELECT u.id, u."referrerId" FROM "User" u
    WHERE u."referrerId" IS NOT NULL AND u."referralQualifiedAt" IS NULL AND ${notTestMoney(Prisma.sql`u.id`)}
      AND (SELECT COALESCE(SUM(amount), 0) FROM "Transaction" WHERE "userId" = u.id AND type = 'DEPOSIT' AND status = 'COMPLETED') >= ${minDeposit}
      AND (SELECT COALESCE(SUM(amount), 0) FROM "Transaction" WHERE "userId" = u.id AND type IN ${STAKE_TYPES} AND status = 'COMPLETED') >= ${minDeposit * wagerMultiple}
    ORDER BY u."createdAt" LIMIT 500`;
  const today = dayStart(dayKeyOf(new Date()));
  for (const c of candidates) {
    await prisma.$transaction(async (tx) => {
      // One inviter at a time, so the daily cap holds.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-invite:${c.referrerId}`}))::text AS locked`;
      const usedToday = await tx.user.count({ where: { referrerId: c.referrerId, referralQualifiedAt: { gte: today } } });
      if (usedToday >= dailyCap) return; // waits for tomorrow's allowance
      const now = new Date();
      const marked = await tx.user.updateMany({ where: { id: c.id, referralQualifiedAt: null }, data: { referralQualifiedAt: now } });
      if (marked.count === 0) return;
      const qualified = await tx.user.count({ where: { referrerId: c.referrerId, referralQualifiedAt: { not: null } } });
      await tx.agentReward.createMany({
        data: [
          { userId: c.referrerId, kind: "INVITE", periodKey: `invitee:${c.id}`, amount: inviterReward, invitees: 1, earnedAt: now },
          { userId: c.id, kind: "INVITE", periodKey: "welcome", amount: inviteeReward, invitees: 0, earnedAt: now },
          ...AGENT.milestones
            .filter((m) => qualified >= m.count)
            .map((m) => ({ userId: c.referrerId, kind: "TASK" as const, periodKey: `m${m.count}`, amount: m.reward, invitees: m.count, earnedAt: now })),
        ],
        skipDuplicates: true,
      });
    });
  }
}

/** The jackpot pool for a week: its share of new invitees' bets plus last week's leftover. */
async function jackpotPool(db: Db, weekKey: string, until?: Date) {
  const start = dayStart(weekKey);
  const end = until ?? dayStart(addDays(weekKey, 7));
  const [turnover] = await db.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(t.amount), 0)::float8 AS total
    FROM "Transaction" t JOIN "User" u ON u.id = t."userId"
    WHERE u."referrerId" IS NOT NULL AND u."createdAt" >= ${start} AND u."createdAt" < ${dayStart(addDays(weekKey, 7))}
      AND t.type IN ${STAKE_TYPES} AND t.status = 'COMPLETED' AND t."createdAt" >= ${start} AND t."createdAt" < ${end}
      AND ${notTestMoney(Prisma.sql`u.id`)}`;
  const prev = await db.agentJackpotWeek.findUnique({ where: { weekKey: addDays(weekKey, -7) }, select: { rolledOver: true } });
  const fromBets = paise((turnover.total * AGENT.jackpot.poolPercent) / 100);
  const rollover = Number(prev?.rolledOver ?? 0);
  return { pool: paise(fromBets + rollover), fromBets, rollover };
}

/** Agents ranked by the commission they earned in [start, end): bets, deposits, invites and tasks. */
async function commissionRanking(db: Db, start: Date, end: Date, limit = 100) {
  return db.$queryRaw<{ userId: string; uid: number | null; commission: number }[]>`
    SELECT r."userId", u.uid, SUM(r.amount)::float8 AS commission
    FROM "AgentReward" r JOIN "User" u ON u.id = r."userId"
    WHERE r.kind IN ('BET', 'DEPOSIT', 'INVITE', 'TASK') AND r."periodKey" <> 'welcome'
      AND r."earnedAt" >= ${start} AND r."earnedAt" < ${end}
    GROUP BY 1, 2
    HAVING SUM(r.amount) >= ${AGENT.jackpot.minCommission}
    ORDER BY commission DESC, MIN(r."earnedAt") ASC
    LIMIT ${limit}`;
}

/** Pays out one finished week of the Agent Jackpot; unwon shares roll over. */
async function settleWeek(weekKey: string) {
  const start = dayStart(weekKey);
  const end = dayStart(addDays(weekKey, 7));
  await prisma.$transaction(
    async (tx) => {
      if (!(await claimSettlement(tx, `week:${weekKey}`))) return;
      const { pool } = await jackpotPool(tx, weekKey);
      const ranking = await commissionRanking(tx, start, end);
      const winners = ranking.map((r, i) => {
        const percent = jackpotShare(i + 1);
        return { rank: i + 1, userId: r.userId, name: playerName(r.uid), commission: paise(r.commission), percent, prize: paise((pool * percent) / 100) };
      });
      const paid = paise(winners.reduce((s, w) => s + w.prize, 0));
      const prizes = winners.filter((w) => w.prize >= 0.01);
      if (prizes.length) {
        await tx.agentReward.createMany({
          data: prizes.map((w) => ({ userId: w.userId, kind: "JACKPOT" as const, periodKey: weekKey, amount: w.prize, invitees: 0, earnedAt: end })),
          skipDuplicates: true,
        });
      }
      await tx.agentJackpotWeek.create({
        data: { weekKey, pool, paid, rolledOver: paise(pool - paid), winners: winners as unknown as Prisma.InputJsonValue },
      });
    },
    { timeout: 30_000 }
  );
}

let lastSweep = 0;
let running: Promise<void> | null = null;

/**
 * Settles whatever is due: finished days (rebates), new joining rewards and
 * finished weeks (jackpot). Cheap to call often — it runs at most once a
 * minute per server, and every payout is keyed so it happens exactly once.
 */
export function runAgentSweep(): Promise<void> {
  if (running) return running;
  if (Date.now() - lastSweep < 60_000) return Promise.resolve();
  lastSweep = Date.now();
  running = (async () => {
    try {
      const now = new Date();
      const todayKey = dayKeyOf(now);
      let launch = (await prisma.setting.findUnique({ where: { key: LAUNCH_KEY } }))?.value;
      if (!launch) {
        await prisma.setting.upsert({ where: { key: LAUNCH_KEY }, update: {}, create: { key: LAUNCH_KEY, value: todayKey } });
        launch = (await prisma.setting.findUnique({ where: { key: LAUNCH_KEY } }))?.value ?? todayKey;
      }
      // Days: the last two weeks at most, oldest first.
      const from = [launch, addDays(todayKey, -14)].sort().pop()!;
      const days: string[] = [];
      for (let k = from; k < todayKey; k = addDays(k, 1)) {
        if (dayStart(addDays(k, 1)).getTime() + SETTLE_GRACE_MS <= now.getTime()) days.push(k);
      }
      const doneDays = new Set(
        (await prisma.agentSettlement.findMany({ where: { key: { in: days.map((d) => `day:${d}`) } }, select: { key: true } })).map((r) => r.key)
      );
      for (const d of days) if (!doneDays.has(`day:${d}`)) await settleDay(d);

      await qualifyInvites();

      // Weeks: each finished one since launch, oldest first (the rollover chains through them).
      const weeks: string[] = [];
      for (let w = weekKeyOf(launch); w < weekKeyOf(todayKey); w = addDays(w, 7)) {
        if (dayStart(addDays(w, 7)).getTime() + SETTLE_GRACE_MS <= now.getTime()) weeks.push(w);
      }
      const doneWeeks = new Set(
        (await prisma.agentSettlement.findMany({ where: { key: { in: weeks.map((w) => `week:${w}`) } }, select: { key: true } })).map((r) => r.key)
      );
      for (const w of weeks) if (!doneWeeks.has(`week:${w}`)) await settleWeek(w);
    } catch (err) {
      console.error("Agent sweep failed", err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Links a new player to whoever owns the invite code, and that player's inviters above. */
export async function findInviter(code: string) {
  const uid = Number(code);
  const inviter = Number.isInteger(uid) && uid > 0 ? await prisma.user.findUnique({ where: { uid }, select: { id: true, role: true, isBanned: true } }) : null;
  if (!inviter || inviter.role === "ADMIN" || inviter.isBanned) throw new ApiError(400, "This invite code is not valid. Check it, or leave it empty.");
  return inviter.id;
}

export async function linkInvitee(inviterId: string, inviteeId: string) {
  await prisma.$transaction(async (tx) => {
    const above = await tx.agentLink.findMany({ where: { descendantId: inviterId, depth: { lt: AGENT.maxDepth } } });
    await tx.agentLink.createMany({
      data: [
        { ancestorId: inviterId, descendantId: inviteeId, depth: 1 },
        ...above.map((l) => ({ ancestorId: l.ancestorId, descendantId: inviteeId, depth: l.depth + 1 })),
      ],
      skipDuplicates: true,
    });
    await tx.user.update({ where: { id: inviteeId }, data: { referrerId: inviterId } });
  });
}

const sumOf = (r: { _sum: { amount: Prisma.Decimal | null } }) => Number(r._sum.amount ?? 0);

/** Everything the EARN page shows. */
export async function getAgentSummary(userId: string, baseUrl: string) {
  await runAgentSweep();
  const now = new Date();
  const todayKey = dayKeyOf(now);
  const weekKey = weekKeyOf(todayKey);
  const weekStart = dayStart(weekKey);
  const weekEnd = dayStart(addDays(weekKey, 7));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { uid: true } });

  const [stats, direct, qualified, qualifiedToday, claimable, total, today, invitation, inviteRewards, pool, ranking] = await Promise.all([
    teamStats(prisma, [userId], now),
    prisma.user.count({ where: { referrerId: userId } }),
    prisma.user.count({ where: { referrerId: userId, referralQualifiedAt: { not: null } } }),
    prisma.user.count({ where: { referrerId: userId, referralQualifiedAt: { gte: dayStart(todayKey) } } }),
    prisma.agentReward.aggregate({ where: { userId, claimId: null }, _sum: { amount: true } }),
    prisma.agentReward.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.agentReward.aggregate({ where: { userId, createdAt: { gte: dayStart(todayKey) } }, _sum: { amount: true } }),
    prisma.agentReward.aggregate({ where: { userId, kind: { in: ["INVITE", "TASK"] }, NOT: { periodKey: "welcome" } }, _sum: { amount: true } }),
    prisma.agentReward.aggregate({ where: { userId, kind: "INVITE", NOT: { periodKey: "welcome" } }, _sum: { amount: true } }),
    jackpotPool(prisma, weekKey, now),
    commissionRanking(prisma, weekStart, weekEnd),
  ]);
  const team = stats.get(userId) ?? { size: 0, betting: 0 };
  const level = teamLevelFor(team.size, team.betting);
  const next = AGENT.teamLevels.find((t) => t.level === level + 1) ?? null;
  const [mine] = await prisma.$queryRaw<{ commission: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::float8 AS commission FROM "AgentReward"
    WHERE "userId" = ${userId} AND kind IN ('BET', 'DEPOSIT', 'INVITE', 'TASK') AND "periodKey" <> 'welcome'
      AND "earnedAt" >= ${weekStart} AND "earnedAt" < ${weekEnd}`;
  const myRankIndex = ranking.findIndex((r) => r.userId === userId);
  const top = ranking.slice(0, 3).map((r, i) => {
    const percent = jackpotShare(i + 1);
    return { rank: i + 1, name: playerName(r.uid), uid: r.uid, commission: paise(r.commission), percent, prize: paise((pool.pool * percent) / 100) };
  });

  return {
    inviteCode: String(user.uid ?? ""),
    inviteUrl: `${baseUrl}/invite/${user.uid ?? ""}`,
    team: { level, size: team.size, betting: paise(team.betting), direct, next },
    rates: {
      betUpTo: Math.round(AGENT.betRebate[level].reduce((s, r) => s + r, 0) * 100) / 100,
      depositUpTo: AGENT.topUpRebate[level],
    },
    rewards: { claimable: sumOf(claimable), total: sumOf(total), today: sumOf(today), invitation: sumOf(invitation) },
    invite: {
      ...AGENT.join,
      todayLeft: Math.max(0, AGENT.join.dailyCap - qualifiedToday),
      invitees: direct,
      qualified,
      rewards: sumOf(inviteRewards),
      milestones: AGENT.milestones.map((m) => ({ ...m, reached: qualified >= m.count })),
    },
    jackpot: {
      weekKey,
      endsAt: weekEnd.toISOString(),
      pool: pool.pool,
      minCommission: AGENT.jackpot.minCommission,
      myCommission: paise(mine.commission),
      myRank: myRankIndex >= 0 ? myRankIndex + 1 : null,
      top,
    },
    rules: AGENT,
  };
}

/** Reward details: one month (IST) of rewards, optionally of one kind. */
export async function getAgentRewards(userId: string, month: string, kind?: AgentRewardKind) {
  const start = dayStart(`${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const end = dayStart(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`);
  const items = await prisma.agentReward.findMany({
    where: { userId, earnedAt: { gte: start, lt: end }, ...(kind ? { kind } : {}) },
    orderBy: { earnedAt: "desc" },
    take: 300,
    select: { id: true, kind: true, periodKey: true, amount: true, invitees: true, earnedAt: true, claimId: true },
  });
  return {
    month,
    total: paise(items.reduce((s, r) => s + Number(r.amount), 0)),
    items: items.map((r) => ({ ...r, amount: Number(r.amount), claimed: Boolean(r.claimId) })),
  };
}

export async function getAgentClaims(userId: string) {
  const claims = await prisma.agentClaim.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 });
  return claims.map((c) => ({ id: c.id, amount: Number(c.amount), createdAt: c.createdAt, status: "Completed" }));
}

/** Moves every waiting reward into the balance as one BONUS (played once before withdrawal). */
export async function claimAgentRewards(userId: string) {
  await assertCanTransact(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const waiting = await tx.agentReward.findMany({ where: { userId, claimId: null }, select: { id: true, amount: true } });
    const amount = paise(waiting.reduce((s, r) => s + Number(r.amount), 0));
    if (amount < 0.01) throw new ApiError(400, "There are no rewards to claim yet.");
    const claim = await tx.agentClaim.create({ data: { userId, amount } });
    await tx.agentReward.updateMany({ where: { id: { in: waiting.map((r) => r.id) } }, data: { claimId: claim.id } });
    const wallet = await tx.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
    await tx.transaction.create({ data: { userId, type: "BONUS", amount, status: "COMPLETED", provider: "agent-reward" } });
    return { amount, balance: Number(wallet.balance) };
  });
}

/** My team, one subordinate level at a time. */
export async function getAgentTeam(userId: string, depth: number) {
  const [counts, members] = await Promise.all([
    prisma.agentLink.groupBy({ by: ["depth"], where: { ancestorId: userId }, _count: true, orderBy: { depth: "asc" } }),
    prisma.$queryRaw<{ uid: number | null; joinedAt: Date; betting: number; deposited: boolean }[]>`
      SELECT u.uid, u."createdAt" AS "joinedAt",
        COALESCE((SELECT SUM(amount) FROM "Transaction" WHERE "userId" = u.id AND type IN ${STAKE_TYPES} AND status = 'COMPLETED'), 0)::float8 AS betting,
        EXISTS (SELECT 1 FROM "Transaction" WHERE "userId" = u.id AND type = 'DEPOSIT' AND status = 'COMPLETED') AS deposited
      FROM "AgentLink" l JOIN "User" u ON u.id = l."descendantId"
      WHERE l."ancestorId" = ${userId} AND l.depth = ${depth}
      ORDER BY u."createdAt" DESC LIMIT 200`,
  ]);
  return {
    counts: Array.from({ length: AGENT.maxDepth }, (_, i) => ({ depth: i + 1, count: counts.find((c) => c.depth === i + 1)?._count ?? 0 })),
    members: members.map((m) => ({ name: playerName(m.uid), joinedAt: m.joinedAt, betting: paise(m.betting), deposited: m.deposited })),
  };
}

/** This week's live ranking (top 100) with the prize each rank would get now. */
export async function getJackpotRanking(userId: string) {
  await runAgentSweep();
  const now = new Date();
  const weekKey = weekKeyOf(dayKeyOf(now));
  const start = dayStart(weekKey);
  const end = dayStart(addDays(weekKey, 7));
  const [pool, ranking] = await Promise.all([jackpotPool(prisma, weekKey, now), commissionRanking(prisma, start, end)]);
  const list = ranking.map((r, i) => {
    const percent = jackpotShare(i + 1);
    return { rank: i + 1, name: playerName(r.uid), uid: r.uid, commission: paise(r.commission), percent, prize: paise((pool.pool * percent) / 100), isMe: r.userId === userId };
  });
  return { weekKey, endsAt: end.toISOString(), pool: pool.pool, minCommission: AGENT.jackpot.minCommission, list };
}

export async function getJackpotHistory() {
  const weeks = await prisma.agentJackpotWeek.findMany({ orderBy: { weekKey: "desc" }, take: 12 });
  return weeks.map((w) => ({
    weekKey: w.weekKey,
    pool: Number(w.pool),
    paid: Number(w.paid),
    rolledOver: Number(w.rolledOver),
    // Only what the app shows: no internal user ids.
    winners: (w.winners as { rank: number; name: string; commission: number; prize: number; percent: number }[])
      .slice(0, 10)
      .map(({ rank, name, commission, prize, percent }) => ({ rank, name, commission, prize, percent })),
  }));
}

// --- Admin: who invited whom, and what it earned ---

/**
 * Every agent (a player who invited at least one other), most invites
 * first, with their team and the rewards it earned, plus totals. Runs the
 * sweep first so the numbers include rewards just due.
 */
export async function adminAgentOverview(search: string, limit = 200) {
  await runAgentSweep();
  const uid = /^\d+$/.test(search) ? Number(search) : -1;
  const like = `%${search}%`;
  const agents = await prisma.$queryRaw<
    { uid: number | null; name: string; phone: string | null; direct: number; qualified: number; team: number; directDeposits: number; earned: number; claimed: number; waiting: number; lastInviteAt: Date | null }[]
  >`
    SELECT u.uid, TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS name, u.phone,
      (SELECT COUNT(*)::int FROM "User" c WHERE c."referrerId" = u.id) AS direct,
      (SELECT COUNT(*)::int FROM "User" c WHERE c."referrerId" = u.id AND c."referralQualifiedAt" IS NOT NULL) AS qualified,
      (SELECT COUNT(*)::int FROM "AgentLink" l WHERE l."ancestorId" = u.id) AS team,
      (SELECT COALESCE(SUM(t.amount), 0)::float8 FROM "Transaction" t JOIN "User" c ON c.id = t."userId"
        WHERE c."referrerId" = u.id AND t.type = 'DEPOSIT' AND t.status = 'COMPLETED') AS "directDeposits",
      (SELECT COALESCE(SUM(r.amount), 0)::float8 FROM "AgentReward" r WHERE r."userId" = u.id AND r."periodKey" <> 'welcome') AS earned,
      (SELECT COALESCE(SUM(r.amount), 0)::float8 FROM "AgentReward" r WHERE r."userId" = u.id AND r."periodKey" <> 'welcome' AND r."claimId" IS NOT NULL) AS claimed,
      (SELECT COALESCE(SUM(r.amount), 0)::float8 FROM "AgentReward" r WHERE r."userId" = u.id AND r."periodKey" <> 'welcome' AND r."claimId" IS NULL) AS waiting,
      (SELECT MAX(c."createdAt") FROM "User" c WHERE c."referrerId" = u.id) AS "lastInviteAt"
    FROM "User" u
    WHERE EXISTS (SELECT 1 FROM "User" c WHERE c."referrerId" = u.id)
      AND (${search} = '' OR u.uid = ${uid} OR u.phone ILIKE ${like} OR CONCAT(u."firstName", ' ', u."lastName") ILIKE ${like})
    ORDER BY direct DESC, earned DESC
    LIMIT ${limit}`;
  const [totals] = await prisma.$queryRaw<{ invited: number; qualified: number; agents: number; earned: number; claimed: number; welcome: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "User" WHERE "referrerId" IS NOT NULL) AS invited,
      (SELECT COUNT(*)::int FROM "User" WHERE "referralQualifiedAt" IS NOT NULL) AS qualified,
      (SELECT COUNT(DISTINCT "referrerId")::int FROM "User" WHERE "referrerId" IS NOT NULL) AS agents,
      (SELECT COALESCE(SUM(amount), 0)::float8 FROM "AgentReward" WHERE "periodKey" <> 'welcome') AS earned,
      (SELECT COALESCE(SUM(amount), 0)::float8 FROM "AgentReward" WHERE "periodKey" <> 'welcome' AND "claimId" IS NOT NULL) AS claimed,
      (SELECT COALESCE(SUM(amount), 0)::float8 FROM "AgentReward" WHERE "periodKey" = 'welcome') AS welcome`;
  const byKind = await prisma.agentReward.groupBy({ by: ["kind"], where: { NOT: { periodKey: "welcome" } }, _sum: { amount: true } });
  const weekKey = weekKeyOf(dayKeyOf(new Date()));
  const pool = await jackpotPool(prisma, weekKey, new Date());
  return {
    totals: { ...totals, byKind: Object.fromEntries(byKind.map((k) => [k.kind, Number(k._sum.amount ?? 0)])), jackpotPoolThisWeek: pool.pool },
    agents: agents.map((a) => ({ ...a, earned: paise(a.earned), claimed: paise(a.claimed), waiting: paise(a.waiting), directDeposits: paise(a.directDeposits) })),
  };
}

/** One agent: who invited them, their invitees (level 1) with deposits and bets, team size per level, rewards and claims. */
export async function adminAgentDetail(uid: number) {
  await runAgentSweep();
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true, uid: true, firstName: true, lastName: true, phone: true, referrerId: true, createdAt: true } });
  if (!user) throw new ApiError(404, "No player with that UID.");
  const invitedBy = user.referrerId ? await prisma.user.findUnique({ where: { id: user.referrerId }, select: { uid: true, firstName: true, lastName: true } }) : null;
  const invitees = await prisma.$queryRaw<{ uid: number | null; name: string; phone: string | null; joinedAt: Date; qualifiedAt: Date | null; deposited: number; staked: number; theirInvites: number }[]>`
    SELECT c.uid, TRIM(CONCAT(c."firstName", ' ', c."lastName")) AS name, c.phone, c."createdAt" AS "joinedAt", c."referralQualifiedAt" AS "qualifiedAt",
      (SELECT COALESCE(SUM(amount), 0)::float8 FROM "Transaction" WHERE "userId" = c.id AND type = 'DEPOSIT' AND status = 'COMPLETED') AS deposited,
      (SELECT COALESCE(SUM(amount), 0)::float8 FROM "Transaction" WHERE "userId" = c.id AND type IN ${STAKE_TYPES} AND status = 'COMPLETED') AS staked,
      (SELECT COUNT(*)::int FROM "User" g WHERE g."referrerId" = c.id) AS "theirInvites"
    FROM "User" c WHERE c."referrerId" = ${user.id}
    ORDER BY c."createdAt" DESC LIMIT 500`;
  const levels = await prisma.agentLink.groupBy({ by: ["depth"], where: { ancestorId: user.id }, _count: true, orderBy: { depth: "asc" } });
  const rewards = await prisma.agentReward.groupBy({ by: ["kind"], where: { userId: user.id }, _sum: { amount: true }, _count: true });
  const waiting = await prisma.agentReward.aggregate({ where: { userId: user.id, claimId: null }, _sum: { amount: true } });
  const recent = await prisma.agentReward.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, select: { kind: true, periodKey: true, amount: true, invitees: true, earnedAt: true, claimId: true } });
  const claims = await prisma.agentClaim.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, select: { amount: true, createdAt: true } });
  const inviteeByKey = new Map<string, number | null>();
  const inviteKeys = recent.filter((r) => r.periodKey.startsWith("invitee:")).map((r) => r.periodKey.slice(8));
  if (inviteKeys.length) (await prisma.user.findMany({ where: { id: { in: inviteKeys } }, select: { id: true, uid: true } })).forEach((u) => inviteeByKey.set(u.id, u.uid));
  return {
    agent: { uid: user.uid, name: `${user.firstName} ${user.lastName}`.trim(), phone: user.phone, joinedAt: user.createdAt },
    invitedBy: invitedBy ? { uid: invitedBy.uid, name: `${invitedBy.firstName} ${invitedBy.lastName}`.trim() } : null,
    levels: levels.map((l) => ({ depth: l.depth, players: l._count })),
    rewards: rewards.map((r) => ({ kind: r.kind, amount: paise(Number(r._sum.amount ?? 0)), count: r._count })),
    waiting: paise(Number(waiting._sum.amount ?? 0)),
    recentRewards: recent.map((r) => ({
      kind: r.kind,
      note: r.periodKey.startsWith("invitee:") ? `invitee UID ${inviteeByKey.get(r.periodKey.slice(8)) ?? "?"}` : r.periodKey,
      amount: Number(r.amount),
      invitees: r.invitees,
      earnedAt: r.earnedAt,
      claimed: r.claimId !== null,
    })),
    claims: claims.map((c) => ({ amount: Number(c.amount), at: c.createdAt })),
    invitees: invitees.map((i) => ({ ...i, deposited: paise(i.deposited), staked: paise(i.staked) })),
  };
}

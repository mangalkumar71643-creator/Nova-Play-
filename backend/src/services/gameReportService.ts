import { prisma } from "../db/prismaClient";
import { LOTTERY_RTP } from "./lotteryHouse";
import { env } from "../config/env";

/**
 * Per-game house result, from each game's own bet table (so it covers every
 * bet ever placed, not just new ones). For each game: what players staked,
 * what the game paid back, the profit (staked - paid) and its share of
 * stakes, over today, 7 days, 30 days and all time (India time), next to the
 * edge the game is set to keep (lottery games keep the lower lottery edge).
 *
 * Voided bets (stake refunded) are left out. Bets still in play count their
 * stake, which has already been taken, and pay nothing yet.
 */

type Source = {
  key: string;
  name: string;
  category: string;
  table: string;
  /** SQL for the amount staked on a row. */
  stake: string;
  /** SQL for the amount paid on a row. */
  paid: string;
  /** Extra SQL condition, e.g. leaving out voided bets. */
  where?: string;
};

const NOT_VOID = `status::text <> 'VOID'`;

export const SOURCES: Source[] = [
  // Crash
  { key: "Aviator", name: "Aviator", category: "Crash", table: "AviatorBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "CricketX", name: "Cricket X", category: "Crash", table: "CricketXBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Vortex", name: "Vortex", category: "Crash", table: "VortexRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "Rocket", name: "Rocket", category: "Crash", table: "RocketBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "GoalRush", name: "Goal Rush", category: "Crash", table: "GoalRushBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "BigCatch", name: "Big Catch", category: "Crash", table: "BigCatchBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Cosmonaut", name: "Cosmonaut", category: "Crash", table: "CosmonautBet", stake: "amount", paid: "payout", where: NOT_VOID },
  {
    key: "SkyJet",
    name: "Sky Jet (with jackpot)",
    category: "Crash",
    table: "SkyJetBet",
    stake: "amount",
    paid: `payout + COALESCE((SELECT w.amount FROM "SkyJetJackpotWin" w WHERE w."betId" = t.id), 0)`,
    where: NOT_VOID,
  },
  { key: "NightRacer", name: "Night Racer", category: "Crash", table: "NightRacerBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Airship", name: "Airship", category: "Crash", table: "AirshipBet", stake: "amount", paid: "payout", where: NOT_VOID },
  // Slots
  { key: "Slot", name: "Royal Gems (Slot)", category: "Slots", table: "SlotSpin", stake: "stake", paid: "payout" },
  { key: "Aces", name: "Golden Aces", category: "Slots", table: "AcesSpin", stake: "stake", paid: "payout" },
  { key: "CandyBlast", name: "Candy Blast", category: "Slots", table: "CandyBlastSpin", stake: "stake", paid: "payout" },
  { key: "Neon777", name: "Neon 777", category: "Slots", table: "Neon777Spin", stake: "stake", paid: "payout" },
  { key: "MoneyComing", name: "Money Coming", category: "Slots", table: "MoneyComingSpin", stake: "stake", paid: "payout" },
  { key: "FruitMachine", name: "Fruit Machine", category: "Slots", table: "FruitMachineSpin", stake: "stake", paid: "payout" },
  { key: "FishermansCatch", name: "Fisherman's Catch", category: "Slots", table: "FishermanSpin", stake: "stake", paid: "payout" },
  { key: "BookOfPharaoh", name: "Book of Pharaoh", category: "Slots", table: "BookOfPharaohSpin", stake: "stake", paid: "payout" },
  { key: "GatesOfZeus", name: "Gates of Zeus", category: "Slots", table: "ZeusSpin", stake: "stake", paid: "payout" },
  { key: "WolfMoon", name: "Wolf Moon", category: "Slots", table: "WolfMoonSpin", stake: "stake", paid: "payout" },
  // Card & Table
  { key: "AndarBahar", name: "Andar Bahar", category: "Card & Table", table: "AndarBaharBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "TeenPatti", name: "Teen Patti", category: "Card & Table", table: "TeenPattiBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "DragonTiger", name: "Dragon Tiger", category: "Card & Table", table: "DragonTigerBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Baccarat", name: "Baccarat", category: "Card & Table", table: "BaccaratBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Blackjack", name: "Blackjack", category: "Card & Table", table: "BlackjackHand", stake: `"totalStake"`, paid: "payout" },
  { key: "Roulette", name: "Roulette", category: "Card & Table", table: "RouletteBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Hilo", name: "Hi-Lo", category: "Card & Table", table: "HiloRound", stake: "stake", paid: "payout" },
  { key: "VideoPoker", name: "Video Poker", category: "Card & Table", table: "VideoPokerRound", stake: "stake", paid: "payout" },
  { key: "CasinoHoldem", name: "Casino Hold'em", category: "Card & Table", table: "CasinoHoldemHand", stake: "staked", paid: "payout" },
  { key: "ThreeCardPoker", name: "Three Card Poker", category: "Card & Table", table: "ThreeCardPokerHand", stake: "staked", paid: "payout" },
  // Dice & Instant
  { key: "Dice", name: "Dice", category: "Dice & Instant", table: "DiceBet", stake: "stake", paid: "payout" },
  { key: "Limbo", name: "Limbo", category: "Dice & Instant", table: "LimboBet", stake: "stake", paid: "payout" },
  { key: "Plinko", name: "Plinko", category: "Dice & Instant", table: "PlinkoBet", stake: "stake", paid: "payout" },
  { key: "SevenUpDown", name: "7 Up Down", category: "Dice & Instant", table: "SevenUpDownBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "Diamonds", name: "Diamonds", category: "Dice & Instant", table: "DiamondsBet", stake: "stake", paid: "payout" },
  { key: "Keno", name: "Keno", category: "Dice & Instant", table: "KenoBet", stake: "stake", paid: "payout" },
  { key: "LuckyWheel", name: "Lucky Wheel", category: "Dice & Instant", table: "WheelSpin", stake: "stake", paid: "payout" },
  { key: "ScratchCard", name: "Scratch Card", category: "Dice & Instant", table: "ScratchTicket", stake: "stake", paid: "payout" },
  { key: "DiceDuel", name: "Dice Duel", category: "Dice & Instant", table: "DiceDuelBet", stake: "stake", paid: "payout" },
  { key: "ColorBall", name: "Color Ball", category: "Dice & Instant", table: "ColorBallBet", stake: "stake", paid: "payout" },
  // Lottery
  { key: "WinGo", name: "Win Go", category: "Lottery", table: "WinGoBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "K3Lottery", name: "K3 Lottery", category: "Lottery", table: "K3Bet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "FiveDLottery", name: "5D Lottery", category: "Lottery", table: "FiveDBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "TrxWin", name: "Trx Win", category: "Lottery", table: "TrxBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "JhandiMunda", name: "Jhandi Munda", category: "Lottery", table: "JhandiMundaBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "FortuneSix", name: "Fortune 6", category: "Lottery", table: "FortuneSixBet", stake: "stake", paid: "payout" },
  // Mines & Cash-out
  { key: "Mines", name: "Mines", category: "Mines & Cash-out", table: "MinesRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "ChickenRoad", name: "Chicken Road", category: "Mines & Cash-out", table: "ChickenRoadRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "DragonTower", name: "Dragon Tower", category: "Mines & Cash-out", table: "DragonTowerRound", stake: "stake", paid: "payout" },
  { key: "Pump", name: "Pump", category: "Mines & Cash-out", table: "PumpRound", stake: "stake", paid: "payout" },
  { key: "CoinFlip", name: "Coin Flip", category: "Mines & Cash-out", table: "CoinFlipRound", stake: "stake", paid: "payout" },
  { key: "PenaltyHero", name: "Penalty Hero", category: "Mines & Cash-out", table: "PenaltyRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "LuckyCups", name: "Lucky Cups", category: "Mines & Cash-out", table: "CupsRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "BombSquad", name: "Bomb Squad", category: "Mines & Cash-out", table: "BombRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "VaultHeist", name: "Vault Heist", category: "Mines & Cash-out", table: "VaultRound", stake: "stake", paid: "payout", where: NOT_VOID },
  { key: "TreasureDig", name: "Treasure Dig", category: "Mines & Cash-out", table: "TreasureRound", stake: "stake", paid: "payout", where: NOT_VOID },
  // No longer offered, kept so their history still counts.
  { key: "ColorPredict", name: "Color Predict (old Win Go)", category: "Retired", table: "ColorGameBet", stake: "amount", paid: "payout", where: NOT_VOID },
  { key: "LegacyRounds", name: "Old coin flip / dice", category: "Retired", table: "GameRound", stake: "stake", paid: "payout" },
];

type Row = {
  key: string;
  staked_all: unknown;
  paid_all: unknown;
  bets_all: bigint;
  players_all: bigint;
  staked_d30: unknown;
  paid_d30: unknown;
  staked_d7: unknown;
  paid_d7: unknown;
  staked_today: unknown;
  paid_today: unknown;
  bets_today: bigint;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getGameReport() {
  // Day boundaries in India time, as UTC timestamps.
  const today = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'`;
  const d7 = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - interval '6 days') AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'`;
  const d30 = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - interval '29 days') AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'`;
  // Built only from the fixed SOURCES list above; nothing here comes from a request.
  const parts = SOURCES.map(
    (s) => `SELECT '${s.key}' AS key,
      COALESCE(SUM(${s.stake}), 0) AS staked_all,
      COALESCE(SUM(${s.paid}), 0) AS paid_all,
      COUNT(*) AS bets_all,
      COUNT(DISTINCT t."userId") AS players_all,
      COALESCE(SUM(${s.stake}) FILTER (WHERE t."createdAt" >= ${d30}), 0) AS staked_d30,
      COALESCE(SUM(${s.paid}) FILTER (WHERE t."createdAt" >= ${d30}), 0) AS paid_d30,
      COALESCE(SUM(${s.stake}) FILTER (WHERE t."createdAt" >= ${d7}), 0) AS staked_d7,
      COALESCE(SUM(${s.paid}) FILTER (WHERE t."createdAt" >= ${d7}), 0) AS paid_d7,
      COALESCE(SUM(${s.stake}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS staked_today,
      COALESCE(SUM(${s.paid}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS paid_today,
      COUNT(*) FILTER (WHERE t."createdAt" >= ${today}) AS bets_today
    FROM "${s.table}" t ${s.where ? `WHERE ${s.where}` : ""}`
  );
  const rows = await prisma.$queryRawUnsafe<Row[]>(parts.join("\nUNION ALL\n"));
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const period = (staked: unknown, paid: unknown) => {
    const s = r2(Number(staked));
    const p = r2(Number(paid));
    return { staked: s, paid: p, profit: r2(s - p), edgePercent: s > 0 ? Math.round(((s - p) / s) * 10000) / 100 : null };
  };
  // Target house edge per game, where one setting fixes it. Retired games
  // and games with their own paytables (slots, poker, ...) show none.
  const edgeOf = (key: string, category: string): number | null => {
    if (category === "Retired") return null;
    if (category === "Lottery") return 1 - LOTTERY_RTP;
    if (category === "Crash") return env.games.crashHouseEdge;
    if (["AndarBahar", "TeenPatti", "DragonTiger", "Baccarat", "Roulette"].includes(key)) return 1 - env.games.tableRtp;
    if (key === "SevenUpDown") return 1 - env.games.sevenUpDownRtp;
    if (["Dice", "Limbo", "Plinko", "Keno", "Hilo", "Mines", "ChickenRoad", "DragonTower", "Pump", "CoinFlip"].includes(key)) return 1 - env.games.rtp;
    return null;
  };
  const targetEdge = (key: string, category: string) => {
    const e = edgeOf(key, category);
    return e === null ? null : Math.round(e * 1000) / 10;
  };

  const games = SOURCES.map((src) => {
    const r = byKey.get(src.key)!;
    return {
      key: src.key,
      name: src.name,
      category: src.category,
      targetEdgePercent: targetEdge(src.key, src.category),
      bets: Number(r.bets_all),
      players: Number(r.players_all),
      betsToday: Number(r.bets_today),
      today: period(r.staked_today, r.paid_today),
      d7: period(r.staked_d7, r.paid_d7),
      d30: period(r.staked_d30, r.paid_d30),
      all: period(r.staked_all, r.paid_all),
    };
  });

  // Cross-check against the wallet: every game writes GAME_STAKE / GAME_PAYOUT,
  // so the games should add up to the same totals. Any gap is shown, not hidden.
  const [stakeTx, payTx] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: "GAME_STAKE", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: "GAME_PAYOUT", status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  const sumStaked = r2(games.reduce((t, g) => t + g.all.staked, 0));
  const sumPaid = r2(games.reduce((t, g) => t + g.all.paid, 0));
  const walletStaked = r2(Number(stakeTx._sum.amount ?? 0));
  const walletPaid = r2(Number(payTx._sum.amount ?? 0));

  return {
    games,
    check: {
      gamesStaked: sumStaked,
      gamesPaid: sumPaid,
      walletStaked,
      walletPaid,
      unmatchedStaked: r2(walletStaked - sumStaked),
      unmatchedPaid: r2(walletPaid - sumPaid),
    },
  };
}

/** Shown first while too few games have been played to fill the Hot list. */
const DEFAULT_HOT = ["Aviator", "Mines", "ChickenRoad", "WinGo", "TeenPatti", "AndarBahar", "DragonTiger", "Dice", "Plinko", "Slot"];
const HOT_CACHE_MS = 10 * 60 * 1000;
let hotCache: { at: number; games: { key: string; plays30d: number; players30d: number }[] } | null = null;

/**
 * The most played games: ranked by bets placed in the last 30 days (then
 * all-time bets), topped up from DEFAULT_HOT when fewer have been played.
 * Cached for a few minutes, as it reads every game's bet table.
 */
export async function getHotGames(limit = 10) {
  if (hotCache && Date.now() - hotCache.at < HOT_CACHE_MS) return hotCache.games.slice(0, limit);
  const d30 = `now() - interval '30 days'`;
  const live = SOURCES.filter((s) => s.category !== "Retired");
  // Built only from the fixed SOURCES list; nothing here comes from a request.
  const parts = live.map(
    (s) => `SELECT '${s.key}' AS key,
      COUNT(*) FILTER (WHERE t."createdAt" >= ${d30}) AS plays30,
      COUNT(DISTINCT t."userId") FILTER (WHERE t."createdAt" >= ${d30}) AS players30,
      COUNT(*) AS plays_all
    FROM "${s.table}" t ${s.where ? `WHERE ${s.where}` : ""}`
  );
  const rows = await prisma.$queryRawUnsafe<{ key: string; plays30: bigint; players30: bigint; plays_all: bigint }[]>(parts.join("\nUNION ALL\n"));
  const rank = (key: string) => {
    const i = DEFAULT_HOT.indexOf(key);
    return i < 0 ? DEFAULT_HOT.length : i;
  };
  const games = rows
    .map((r) => ({ key: r.key, plays30d: Number(r.plays30), players30d: Number(r.players30), all: Number(r.plays_all) }))
    .sort((a, b) => b.plays30d - a.plays30d || b.all - a.all || rank(a.key) - rank(b.key))
    .map(({ key, plays30d, players30d }) => ({ key, plays30d, players30d }));
  hotCache = { at: Date.now(), games };
  return games.slice(0, limit);
}

/** Every game the admin can track, in report order. */
export function gameCatalog() {
  return SOURCES.map(({ key, name, category }) => ({ key, name, category }));
}

/** Row fields never sent to the panel: a round's live server seed stays secret until it is revealed to the player. */
const HIDDEN_FIELDS = new Set(["serverSeed", "nextServerSeed"]);

/**
 * One game's latest bets (or rounds / spins / hands), newest first, with
 * the player, what was staked and paid, and the row itself for its details
 * — plus the game's totals for today (India time) and all time. `key` must
 * be one of SOURCES; the table and the SQL come only from that list, and
 * the UID filter is a bound parameter.
 */
export async function getGameBets(key: string, uid: number | null, limit: number) {
  const s = SOURCES.find((x) => x.key === key);
  if (!s) return null;
  const where = s.where ?? "TRUE";
  const today = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'`;
  const rows = await prisma.$queryRawUnsafe<{ row: Record<string, unknown>; staked: unknown; paid: unknown; uid: number | null; firstName: string | null; lastName: string | null; phone: string | null }[]>(
    `SELECT row_to_json(t) AS row, (${s.stake}) AS staked, (${s.paid}) AS paid, u.uid, u."firstName", u."lastName", u.phone
     FROM "${s.table}" t JOIN "User" u ON u.id = t."userId"
     WHERE ${where} AND ($1::int IS NULL OR u.uid = $1::int)
     ORDER BY t."createdAt" DESC
     LIMIT ${Math.max(1, Math.min(200, Math.floor(limit)))}`,
    uid
  );
  const [tot] = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT COUNT(*) AS bets_all, COUNT(DISTINCT t."userId") AS players_all,
       COALESCE(SUM(${s.stake}), 0) AS staked_all, COALESCE(SUM(${s.paid}), 0) AS paid_all,
       COUNT(*) FILTER (WHERE t."createdAt" >= ${today}) AS bets_today,
       COUNT(DISTINCT t."userId") FILTER (WHERE t."createdAt" >= ${today}) AS players_today,
       COALESCE(SUM(${s.stake}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS staked_today,
       COALESCE(SUM(${s.paid}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS paid_today
     FROM "${s.table}" t WHERE ${where}`
  );
  const n = (k: string) => Number(tot[k] ?? 0);
  const totals = (period: "today" | "all") => {
    const staked = r2(n(`staked_${period}`));
    const paid = r2(n(`paid_${period}`));
    return { bets: n(`bets_${period}`), players: n(`players_${period}`), staked, paid, profit: r2(staked - paid) };
  };
  return {
    game: { key: s.key, name: s.name, category: s.category },
    today: totals("today"),
    allTime: totals("all"),
    bets: rows.map((r) => {
      const detail = Object.fromEntries(Object.entries(r.row).filter(([k]) => !HIDDEN_FIELDS.has(k)));
      const staked = r2(Number(r.staked));
      const paid = r2(Number(r.paid));
      return {
        id: String(r.row.id),
        createdAt: r.row.createdAt,
        status: r.row.status ?? null,
        player: { uid: r.uid, name: [r.firstName, r.lastName].filter(Boolean).join(" ") || null, phone: r.phone },
        staked,
        paid,
        profit: r2(staked - paid),
        detail,
      };
    }),
  };
}

/** "Playing now": players with a bet in this many latest minutes. */
export const ACTIVE_WINDOW_MINUTES = 5;

/**
 * Every game at a glance, for the panel's live overview: players with a bet
 * in the last ACTIVE_WINDOW_MINUTES (who is playing right now), bets in that
 * window, and the house profit (staked - paid) today (India time) and all
 * time. One query over the fixed SOURCES list; nothing comes from a request.
 */
export async function getGamesOverview() {
  const today = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'`;
  const recent = `now() - interval '${ACTIVE_WINDOW_MINUTES} minutes'`;
  const parts = SOURCES.filter((s) => s.category !== "Retired").map(
    (s) => `SELECT '${s.key}' AS key,
      COUNT(DISTINCT t."userId") FILTER (WHERE t."createdAt" >= ${recent}) AS active_now,
      COUNT(*) FILTER (WHERE t."createdAt" >= ${recent}) AS bets_now,
      COUNT(DISTINCT t."userId") FILTER (WHERE t."createdAt" >= ${today}) AS players_today,
      COALESCE(SUM(${s.stake}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS staked_today,
      COALESCE(SUM(${s.paid}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS paid_today,
      COALESCE(SUM(${s.stake}), 0) AS staked_all,
      COALESCE(SUM(${s.paid}), 0) AS paid_all
    FROM "${s.table}" t ${s.where ? `WHERE ${s.where}` : ""}`
  );
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(parts.join("\nUNION ALL\n"));
  const byKey = new Map(rows.map((r) => [String(r.key), r]));
  const games = SOURCES.filter((s) => s.category !== "Retired").map((s) => {
    const r = byKey.get(s.key)!;
    const n = (k: string) => Number(r[k] ?? 0);
    return {
      key: s.key,
      name: s.name,
      category: s.category,
      activeNow: n("active_now"),
      betsNow: n("bets_now"),
      playersToday: n("players_today"),
      profitToday: r2(n("staked_today") - n("paid_today")),
      stakedToday: r2(n("staked_today")),
      profitAll: r2(n("staked_all") - n("paid_all")),
      stakedAll: r2(n("staked_all")),
    };
  });
  const [all] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(DISTINCT u) AS n FROM (${SOURCES.filter((s) => s.category !== "Retired")
      .map((s) => `SELECT t."userId" AS u FROM "${s.table}" t WHERE t."createdAt" >= ${recent}`)
      .join(" UNION ALL ")}) x`
  );
  return {
    windowMinutes: ACTIVE_WINDOW_MINUTES,
    // Someone playing two games counts once here.
    activeNowAllGames: Number(all.n),
    profitToday: r2(games.reduce((t, g) => t + g.profitToday, 0)),
    profitAll: r2(games.reduce((t, g) => t + g.profitAll, 0)),
    games,
  };
}

/**
 * One player's play, game by game, from every game's own bet table: bets,
 * staked, paid back to them and their result (paid - staked: positive = the
 * player is up), plus their latest bets across all games.
 */
export async function getPlayerGames(userId: string) {
  const today = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC'`;
  // Built only from the fixed SOURCES list; the player's id goes in as a parameter ($1).
  const cond = (s: Source) => `WHERE t."userId" = $1${s.where ? ` AND ${s.where}` : ""}`;
  const parts = SOURCES.map(
    (s) => `SELECT '${s.key}' AS key, COUNT(*) AS bets, COALESCE(SUM(${s.stake}), 0) AS staked, COALESCE(SUM(${s.paid}), 0) AS paid,
      COUNT(*) FILTER (WHERE (${s.paid}) > 0) AS wins, MAX(t."createdAt") AS last_at,
      COALESCE(SUM(${s.stake}) FILTER (WHERE t."createdAt" >= ${today}), 0) AS staked_today
    FROM "${s.table}" t ${cond(s)}`
  );
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(parts.join("\nUNION ALL\n"), userId);
  const byKey = new Map(rows.map((r) => [String(r.key), r]));
  const games = SOURCES.map((s) => {
    const r = byKey.get(s.key)!;
    const staked = r2(Number(r.staked));
    const paid = r2(Number(r.paid));
    return {
      key: s.key,
      name: s.name,
      category: s.category,
      bets: Number(r.bets),
      wins: Number(r.wins),
      staked,
      paid,
      playerResult: r2(paid - staked),
      stakedToday: r2(Number(r.staked_today)),
      lastBetAt: r.last_at as Date | null,
    };
  })
    .filter((g) => g.bets > 0)
    .sort((a, b) => b.staked - a.staked);
  const recent = await prisma.$queryRawUnsafe<{ key: string; at: Date; staked: unknown; paid: unknown }[]>(
    `SELECT * FROM (${SOURCES.map((s) => `(SELECT '${s.key}' AS key, t."createdAt" AS at, ${s.stake} AS staked, ${s.paid} AS paid FROM "${s.table}" t ${cond(s)} ORDER BY t."createdAt" DESC LIMIT 50)`).join(" UNION ALL ")}) x ORDER BY at DESC LIMIT 50`,
    userId
  );
  const names = new Map(SOURCES.map((s) => [s.key, s.name]));
  return {
    games,
    totals: {
      bets: games.reduce((t, g) => t + g.bets, 0),
      staked: r2(games.reduce((t, g) => t + g.staked, 0)),
      paid: r2(games.reduce((t, g) => t + g.paid, 0)),
      playerResult: r2(games.reduce((t, g) => t + g.playerResult, 0)),
    },
    recentBets: recent.map((b) => ({ game: names.get(b.key) ?? b.key, at: b.at, staked: r2(Number(b.staked)), paid: r2(Number(b.paid)) })),
  };
}

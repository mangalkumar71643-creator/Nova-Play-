import { prisma } from "../db/prismaClient";

/**
 * Per-game house result, from each game's own bet table (so it covers every
 * bet ever placed, not just new ones). For each game: what players staked,
 * what the game paid back, the profit (staked - paid) and its share of
 * stakes, over today, 7 days, 30 days and all time (India time).
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

const SOURCES: Source[] = [
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

  const games = SOURCES.map((src) => {
    const r = byKey.get(src.key)!;
    return {
      key: src.key,
      name: src.name,
      category: src.category,
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

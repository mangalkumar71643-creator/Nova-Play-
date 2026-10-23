import "dotenv/config";
import { runtimeSettings } from "./runtimeSettings";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  kycProviderMode: (process.env.KYC_PROVIDER_MODE ?? "mock") as "mock" | "live",
  paymentProviderMode: (process.env.PAYMENT_PROVIDER_MODE ?? "mock") as "mock" | "live",
  smsProviderMode: (process.env.SMS_PROVIDER_MODE ?? "mock") as "mock" | "live",

  games: {
    minStake: Number(process.env.GAME_MIN_STAKE ?? 1),
    maxStake: Number(process.env.GAME_MAX_STAKE ?? 500),
    // Return-to-player: long-run share of total stakes paid back as winnings
    // (0.75 = a 25% house edge on Dice, Limbo, Plinko, Keno, Hi-Lo, Mines,
    // Chicken Road, Dragon Tower, Pump and Coin Flip; the crash games use
    // crashHouseEdge and the shared-table games tableRtp below).
    rtp: Number(process.env.GAME_RTP ?? 0.75),
    // Dragon Tiger, Andar Bahar, Teen Patti, Roulette and Baccarat set their
    // multipliers from this (0.85). Under tableLeastPayout the result is
    // picked by the bets, so their real return is lower than this.
    tableRtp: Number(process.env.TABLE_GAME_RTP ?? 0.85),
    // The least a win can pay in Mines, Chicken Road, Dragon Tower, Pump,
    // Hi-Lo and Dice, so a win never returns less than the stake. Their
    // easiest picks (win chance above rtp) return more than rtp as a result.
    minWinMultiplier: Number(process.env.MIN_WIN_MULTIPLIER ?? 1.01),
    // 7 Up Down runs its own, higher edge (0.85 = 15%).
    sevenUpDownRtp: Number(process.env.SEVEN_UP_DOWN_RTP ?? 0.85),
    // Win pays out at this multiple of the stake; win probability is derived
    // from rtp / winMultiplier so the long-run expected value matches rtp.
    winMultiplier: Number(process.env.GAME_WIN_MULTIPLIER ?? 2),
    // House edge of every crash game (Aviator, Rocket, Cricket X, Goal Rush,
    // Airship, Big Catch, Cosmonaut, Night Racer, Sky Jet incl. its jackpot)
    // and Vortex: 0.15 = players get 85% back over time (owner's request,
    // 2026-10-23; it was 0.25). Each game shows it.
    crashHouseEdge: Number(process.env.CRASH_HOUSE_EDGE ?? 0.15),
    // Win Go result rule. Off: the number comes from the round's server
    // seed. On ("true"): the least-staked rule (winGoService.leastStakedNumber),
    // which the app's How to play shows from 1.0.24 — only turn it on once
    // that app version is out.
    winGoLeastStaked: process.env.WINGO_LEAST_STAKED === "true",
    // Same for K3, 5D and Jhandi Munda (least total payout wins) and Trx
    // Win Go (Win Go's least-staked rule): leastPayout.ts. Shown in the
    // app from 1.0.25; older apps are asked to update before they can bet.
    lotteryLeastPayout: process.env.LOTTERY_LEAST_PAYOUT === "true",
    // Same for the shared-table games (7 Up Down, Dragon Tiger, Andar Bahar,
    // Teen Patti, Roulette, Baccarat): the result that pays the least on all
    // bets wins. Shown in the app from 1.0.26.
    tableLeastPayout: process.env.TABLE_LEAST_PAYOUT === "true",
    // Most a single bet can pay out in any game, whatever the stake and
    // multiplier — bounds the house's worst single-bet loss. The admin can
    // change it from the panel; this is the default until they do.
    get maxPayout(): number {
      return runtimeSettings.maxPayout ?? Number(process.env.GAME_MAX_PAYOUT ?? 10000);
    },
  },

  tron: {
    // Trx Win Go reads its results from TRON blocks through a full node API.
    // TronGrid works without a key at low volume; set TRONGRID_API_KEY for
    // its higher rate limits.
    apiUrl: process.env.TRON_API_URL ?? "https://api.trongrid.io",
    apiKey: process.env.TRONGRID_API_KEY ?? "",
  },

  wallet: {
    // Self-service deposits stay off until a real payment provider is wired
    // in; until then the admin credits test balances from the panel.
    // Deposit bonus on a player's first and second deposits only:
    // min(amount * percent, cap). Credited straight into balance (so it's
    // immediately playable) but locked from withdrawal until
    // wageringMultiplier x the bonus is staked — see each game service
    // (e.g. vortexService.ts).
    firstDepositBonusPercent: Number(process.env.FIRST_DEPOSIT_BONUS_PERCENT ?? 0.07),
    secondDepositBonusPercent: Number(process.env.SECOND_DEPOSIT_BONUS_PERCENT ?? 0.05),
    firstDepositBonusCap: Number(process.env.FIRST_DEPOSIT_BONUS_CAP ?? 500),
    wageringMultiplier: Number(process.env.WAGERING_MULTIPLIER ?? 3),
    // Daily withdrawal limits, free withdrawals and the fee depend on the
    // player's VIP level: see VIP_LEVELS in vipService.ts.
  },
};

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";

/**
 * The deposit bonus the admin sets in the panel (Setting "depositBonus"):
 * slabs like "deposit ₹200 or more -> +₹50", on every deposit or the first
 * only, or switched off. The highest slab the amount reaches is the bonus.
 * With nothing saved yet, the old percent bonus from env applies (first
 * deposit firstDepositBonusPercent, second secondDepositBonusPercent, capped
 * at firstDepositBonusCap). Either way the bonus is locked until
 * wageringMultiplier x it has been staked (depositService.completeDeposit).
 */
const DEPOSIT_BONUS_KEY = "depositBonus";

export const MAX_BONUS_TIERS = 20;
export const MAX_TIER_AMOUNT = 1_000_000;

export interface DepositBonusTier {
  min: number;
  bonus: number;
}
export interface DepositBonusConfig {
  enabled: boolean;
  firstOnly: boolean;
  tiers: DepositBonusTier[];
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The saved slabs, or null when the admin never saved any (the env percent applies). */
export async function getDepositBonusConfig(db: Db = prisma): Promise<DepositBonusConfig | null> {
  const row = await db.setting.findUnique({ where: { key: DEPOSIT_BONUS_KEY } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as DepositBonusConfig;
    return { enabled: Boolean(parsed.enabled), firstOnly: Boolean(parsed.firstOnly), tiers: sortTiers(parsed.tiers ?? []) };
  } catch {
    // A broken value pays nothing rather than guessing.
    return { enabled: false, firstOnly: false, tiers: [] };
  }
}

function sortTiers(tiers: DepositBonusTier[]) {
  return [...tiers].sort((a, b) => a.min - b.min);
}

/** null clears the saved slabs (back to the env percent bonus). */
export async function setDepositBonusConfig(config: DepositBonusConfig | null) {
  if (!config) {
    await prisma.setting.deleteMany({ where: { key: DEPOSIT_BONUS_KEY } });
  } else {
    const value = JSON.stringify({ ...config, tiers: sortTiers(config.tiers) });
    await prisma.setting.upsert({ where: { key: DEPOSIT_BONUS_KEY }, update: { value }, create: { key: DEPOSIT_BONUS_KEY, value } });
  }
  return getDepositBonusView();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The bonus a deposit of `amount` earns when the player already has `previousDeposits` completed deposits. */
export function bonusFor(config: DepositBonusConfig | null, amount: number, previousDeposits: number): number {
  if (!config) {
    const percent = previousDeposits === 0 ? env.wallet.firstDepositBonusPercent : previousDeposits === 1 ? env.wallet.secondDepositBonusPercent : 0;
    return round2(Math.min(amount * percent, env.wallet.firstDepositBonusCap));
  }
  if (!config.enabled || (config.firstOnly && previousDeposits > 0)) return 0;
  let bonus = 0;
  for (const t of config.tiers) if (amount >= t.min) bonus = t.bonus;
  return round2(bonus);
}

/** What the admin panel shows and edits. */
export async function getDepositBonusView() {
  const config = await getDepositBonusConfig();
  return {
    saved: config !== null,
    config: config ?? { enabled: false, firstOnly: false, tiers: [] },
    defaultPercent: { first: env.wallet.firstDepositBonusPercent, second: env.wallet.secondDepositBonusPercent, cap: env.wallet.firstDepositBonusCap },
    wageringMultiplier: env.wallet.wageringMultiplier,
    maxTiers: MAX_BONUS_TIERS,
    maxAmount: MAX_TIER_AMOUNT,
  };
}

/**
 * What this player's next deposit earns, for the Deposit screen's preview:
 * slabs as "₹min -> +₹bonus", or the percent for the env bonus. Only a
 * preview — completeDeposit works the bonus out again when the money arrives.
 */
export async function playerDepositBonus(userId: string) {
  const [config, previousDeposits] = await Promise.all([
    getDepositBonusConfig(),
    prisma.transaction.count({ where: { userId, type: "DEPOSIT", status: "COMPLETED" } }),
  ]);
  const wageringMultiplier = env.wallet.wageringMultiplier;
  if (!config) {
    const percent = previousDeposits === 0 ? env.wallet.firstDepositBonusPercent : previousDeposits === 1 ? env.wallet.secondDepositBonusPercent : 0;
    return { tiers: [] as DepositBonusTier[], percent, cap: env.wallet.firstDepositBonusCap, firstOnly: false, wageringMultiplier };
  }
  const eligible = config.enabled && !(config.firstOnly && previousDeposits > 0);
  return { tiers: eligible ? config.tiers : [], percent: 0, cap: 0, firstOnly: config.firstOnly, wageringMultiplier };
}

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";

/**
 * The deposit bonus the admin sets in the panel (Setting "depositBonus"):
 * one rule for a player's first deposit and one for every deposit after
 * it, each either a percent of the amount (with an optional most it can
 * pay) or slabs like "deposit ₹200 or more -> +₹50" (the highest slab the
 * amount reaches is paid). Switched off, no deposit gets a bonus.
 * With nothing saved yet, the old percent bonus from env applies (first
 * deposit firstDepositBonusPercent, second secondDepositBonusPercent, capped
 * at firstDepositBonusCap). Either way the bonus is locked until
 * wageringMultiplier x it has been staked (depositService.completeDeposit).
 */
const DEPOSIT_BONUS_KEY = "depositBonus";

export const MAX_BONUS_TIERS = 20;
export const MAX_TIER_AMOUNT = 1_000_000;
export const MAX_BONUS_PERCENT = 100;

export interface DepositBonusTier {
  min: number;
  bonus: number;
}
/** percent is in % (7 = 7%); cap 0 means no limit. */
export type DepositBonusRule = { type: "percent"; percent: number; cap: number } | { type: "slabs"; tiers: DepositBonusTier[] };
export interface DepositBonusConfig {
  enabled: boolean;
  first: DepositBonusRule;
  every: DepositBonusRule;
}

const NO_BONUS: DepositBonusRule = { type: "percent", percent: 0, cap: 0 };

type Db = Prisma.TransactionClient | typeof prisma;

function sortTiers(tiers: DepositBonusTier[]) {
  return [...tiers].sort((a, b) => a.min - b.min);
}

function normalizeRule(rule: DepositBonusRule | undefined): DepositBonusRule {
  if (!rule) return NO_BONUS;
  if (rule.type === "slabs") return { type: "slabs", tiers: sortTiers(rule.tiers ?? []) };
  return { type: "percent", percent: Number(rule.percent) || 0, cap: Number(rule.cap) || 0 };
}

/** The saved rules, or null when the admin never saved any (the env percent applies). */
export async function getDepositBonusConfig(db: Db = prisma): Promise<DepositBonusConfig | null> {
  const row = await db.setting.findUnique({ where: { key: DEPOSIT_BONUS_KEY } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    // Saved before 2026-10-22 evening: one slab table, on every deposit or the first only.
    if (Array.isArray(parsed.tiers)) {
      const slabs: DepositBonusRule = { type: "slabs", tiers: sortTiers(parsed.tiers) };
      return { enabled: Boolean(parsed.enabled), first: slabs, every: parsed.firstOnly ? NO_BONUS : slabs };
    }
    return { enabled: Boolean(parsed.enabled), first: normalizeRule(parsed.first), every: normalizeRule(parsed.every) };
  } catch {
    // A broken value pays nothing rather than guessing.
    return { enabled: false, first: NO_BONUS, every: NO_BONUS };
  }
}

/** null clears the saved rules (back to the env percent bonus). */
export async function setDepositBonusConfig(config: DepositBonusConfig | null) {
  if (!config) {
    await prisma.setting.deleteMany({ where: { key: DEPOSIT_BONUS_KEY } });
  } else {
    const value = JSON.stringify({ enabled: config.enabled, first: normalizeRule(config.first), every: normalizeRule(config.every) });
    await prisma.setting.upsert({ where: { key: DEPOSIT_BONUS_KEY }, update: { value }, create: { key: DEPOSIT_BONUS_KEY, value } });
  }
  return getDepositBonusView();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The rule a player's next deposit falls under, or null for none. */
function ruleFor(config: DepositBonusConfig | null, previousDeposits: number): DepositBonusRule | null {
  if (!config) {
    const percent = previousDeposits === 0 ? env.wallet.firstDepositBonusPercent : previousDeposits === 1 ? env.wallet.secondDepositBonusPercent : 0;
    return percent > 0 ? { type: "percent", percent: percent * 100, cap: env.wallet.firstDepositBonusCap } : null;
  }
  if (!config.enabled) return null;
  return previousDeposits === 0 ? config.first : config.every;
}

function bonusFromRule(rule: DepositBonusRule | null, amount: number): number {
  if (!rule) return 0;
  if (rule.type === "percent") {
    const raw = (amount * rule.percent) / 100;
    return round2(rule.cap > 0 ? Math.min(raw, rule.cap) : raw);
  }
  let bonus = 0;
  for (const t of rule.tiers) if (amount >= t.min) bonus = t.bonus;
  return round2(bonus);
}

/** The bonus a deposit of `amount` earns when the player already has `previousDeposits` completed deposits. */
export function bonusFor(config: DepositBonusConfig | null, amount: number, previousDeposits: number): number {
  return bonusFromRule(ruleFor(config, previousDeposits), amount);
}

/** What the admin panel shows and edits. */
export async function getDepositBonusView() {
  const [config, amounts] = await Promise.all([getDepositBonusConfig(), getDepositAmounts()]);
  return {
    amounts,
    saved: config !== null,
    config: config ?? { enabled: false, first: NO_BONUS, every: NO_BONUS },
    defaultPercent: { first: env.wallet.firstDepositBonusPercent, second: env.wallet.secondDepositBonusPercent, cap: env.wallet.firstDepositBonusCap },
    wageringMultiplier: env.wallet.wageringMultiplier,
    maxTiers: MAX_BONUS_TIERS,
    maxAmount: MAX_TIER_AMOUNT,
    maxPercent: MAX_BONUS_PERCENT,
  };
}

// The Deposit screen of app 1.0.34+ works the preview out as min(amount *
// percent, cap) or from tiers, so "no limit" goes out as a cap it never reaches.
const NO_CAP = 1_000_000_000;

/**
 * What this player's next deposit earns, for the Deposit screen's preview:
 * slabs ("₹min -> +₹bonus") or a percent (as a fraction, with its cap), and
 * whether it is their first deposit. Only a preview — completeDeposit works
 * the bonus out again when the money arrives.
 */
export async function playerDepositBonus(userId: string) {
  const [config, previousDeposits, amounts] = await Promise.all([
    getDepositBonusConfig(),
    prisma.transaction.count({ where: { userId, type: "DEPOSIT", status: "COMPLETED" } }),
    getDepositAmounts(),
  ]);
  const rule = ruleFor(config, previousDeposits);
  // amounts: the Deposit screen's buttons (app 1.0.39+).
  const base = { amounts, firstDeposit: previousDeposits === 0, firstOnly: false, wageringMultiplier: env.wallet.wageringMultiplier };
  if (!rule) return { ...base, tiers: [] as DepositBonusTier[], percent: 0, cap: 0 };
  if (rule.type === "slabs") return { ...base, tiers: rule.tiers, percent: 0, cap: 0 };
  return { ...base, tiers: [] as DepositBonusTier[], percent: rule.percent / 100, cap: rule.cap > 0 ? rule.cap : NO_CAP };
}

// --- The amount buttons on the app's Deposit screen (Setting "depositAmounts") ---

const DEPOSIT_AMOUNTS_KEY = "depositAmounts";
/** The buttons until the admin saves their own (DepositScreen.tsx QUICK_AMOUNTS). */
export const DEFAULT_DEPOSIT_AMOUNTS = [100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000, 50000];
export const MAX_DEPOSIT_AMOUNTS = 20;

/** The admin's buttons, smallest first, or the default ones. */
export async function getDepositAmounts(db: Db = prisma): Promise<number[]> {
  const row = await db.setting.findUnique({ where: { key: DEPOSIT_AMOUNTS_KEY } });
  if (!row) return DEFAULT_DEPOSIT_AMOUNTS;
  try {
    const list = (JSON.parse(row.value) as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return list.length ? [...new Set(list)].sort((a, b) => a - b) : DEFAULT_DEPOSIT_AMOUNTS;
  } catch {
    return DEFAULT_DEPOSIT_AMOUNTS;
  }
}

/** null goes back to the default buttons. */
export async function setDepositAmounts(amounts: number[] | null) {
  if (!amounts) await prisma.setting.deleteMany({ where: { key: DEPOSIT_AMOUNTS_KEY } });
  else {
    const value = JSON.stringify([...new Set(amounts)].sort((a, b) => a - b));
    await prisma.setting.upsert({ where: { key: DEPOSIT_AMOUNTS_KEY }, update: { value }, create: { key: DEPOSIT_AMOUNTS_KEY, value } });
  }
  return { amounts: await getDepositAmounts(), saved: amounts !== null };
}

import { prisma } from "../db/prismaClient";
import { getPlayerReport } from "./playerReportService";
import * as rupayex from "./rupayexService";
import { PROVIDER as STOCKPAY_TEST_PROVIDER } from "./stockpayService";

/**
 * Automatic withdrawals (owner's request, 2026-10-27): right after a player
 * asks for a withdrawal, it is sent to their bank through RupayEx with no one
 * pressing "Pay with RupayEx" — the same sendPayout the admin's button uses,
 * so it is claimed first and can never be paid twice.
 *
 * Only when nothing about the account needs a look; otherwise it stays
 * PENDING for the admin, as before, and the admin alert says why:
 *   - switched off, or the amount is over the admin's auto limit
 *   - the player has StockPay test (play-money) deposits
 *   - the balance doesn't add up to the transactions (changed by hand)
 *   - another player uses the same bank account
 *   - an earlier withdrawal of theirs is still waiting
 */
const ENABLED_KEY = "autoPayoutEnabled";
const MAX_KEY = "autoPayoutMax";
export const DEFAULT_AUTO_PAYOUT_MAX = 10_000;
export const MAX_AUTO_PAYOUT_MAX = 100_000;

export type AutoPayoutSettings = { enabled: boolean; max: number };

export async function getAutoPayoutSettings(): Promise<AutoPayoutSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [ENABLED_KEY, MAX_KEY] } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const max = Number(get(MAX_KEY));
  return { enabled: get(ENABLED_KEY) !== "0", max: Number.isFinite(max) && max > 0 ? max : DEFAULT_AUTO_PAYOUT_MAX };
}

export async function setAutoPayoutSettings(s: AutoPayoutSettings) {
  for (const [key, value] of [
    [ENABLED_KEY, s.enabled ? "1" : "0"],
    [MAX_KEY, String(s.max)],
  ]) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return getAutoPayoutSettings();
}

/** Why this withdrawal must wait for the admin, or null when it can go out by itself. */
async function holdReason(withdrawalId: string): Promise<string | null> {
  const settings = await getAutoPayoutSettings();
  if (!settings.enabled) return "auto withdrawals are off";
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: withdrawalId }, include: { user: { select: { uid: true } } } });
  if (Number(tx.amount) > settings.max) return `over the auto limit of ₹${settings.max.toLocaleString("en-IN")}`;
  const [testDeposit, olderWaiting] = await Promise.all([
    prisma.transaction.findFirst({ where: { userId: tx.userId, type: "DEPOSIT", provider: STOCKPAY_TEST_PROVIDER, status: "COMPLETED", reversedAt: null }, select: { id: true } }),
    prisma.transaction.count({ where: { userId: tx.userId, type: "WITHDRAWAL", status: "PENDING", id: { not: tx.id } } }),
  ]);
  if (testDeposit) return "has StockPay test (play-money) deposits";
  if (olderWaiting > 0) return "an earlier withdrawal is still waiting";
  if (tx.user.uid == null) return "player has no UID yet";
  const { checks } = await getPlayerReport(tx.user.uid);
  if (Math.abs(checks.balanceDifference) >= 0.01) return "balance doesn't match the transactions";
  if (checks.sameBankAccount.length > 0) return `same bank account as UID ${checks.sameBankAccount.map((u) => u.uid).join(", ")}`;
  return null;
}

export type AutoPayoutResult =
  /** RupayEx confirmed it: the money is in the bank. */
  | { status: "COMPLETED" }
  /** With RupayEx, on its way: the sweep marks it paid (or refunds it) when RupayEx answers. */
  | { status: "SENT" }
  /** RupayEx refused it at once: the amount is back in the player's wallet. */
  | { status: "REFUNDED" }
  /** Left for the admin, as before. */
  | { status: "MANUAL"; reason: string };

/** Never throws: anything that goes wrong leaves the withdrawal for the admin. */
export async function tryAutoPayout(withdrawalId: string): Promise<AutoPayoutResult> {
  try {
    const reason = await holdReason(withdrawalId);
    if (reason) return { status: "MANUAL", reason };
    const user = await prisma.transaction.findUniqueOrThrow({ where: { id: withdrawalId }, select: { user: { select: { payoutAccountNumber: true } } } });
    await rupayex.sendPayout(withdrawalId, user.user.payoutAccountNumber ?? "");
    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: withdrawalId }, select: { status: true } });
    if (after.status === "COMPLETED") return { status: "COMPLETED" };
    if (after.status === "FAILED") return { status: "REFUNDED" };
    return { status: "SENT" };
  } catch (err) {
    return { status: "MANUAL", reason: `auto payout failed: ${(err as Error).message}` };
  }
}

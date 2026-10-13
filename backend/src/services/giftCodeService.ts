import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { assertCanTransact } from "./responsibleGamblingService";

/** Letters and digits that can't be misread for each other (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GENERATED_LENGTH = 8;

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function generateCode() {
  let out = "";
  for (let i = 0; i < GENERATED_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

const listSelect = { id: true, code: true, amount: true, maxUses: true, usedCount: true, active: true, createdAt: true } as const;

export async function listGiftCodes() {
  return prisma.giftCode.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: listSelect });
}

/** A code left empty gets a random one. */
export async function createGiftCode(input: { code?: string; amount: number; maxUses: number }) {
  const amount = Math.round(input.amount * 100) / 100;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = input.code ? normalizeCode(input.code) : generateCode();
    try {
      return await prisma.giftCode.create({ data: { code, amount, maxUses: input.maxUses }, select: listSelect });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      if (input.code) throw new ApiError(409, "That code already exists (or was used before). Pick another.");
    }
  }
  throw new ApiError(500, "Could not make a unique code — try again.");
}

export async function setGiftCodeActive(id: string, active: boolean) {
  const found = await prisma.giftCode.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Gift code not found");
  return prisma.giftCode.update({ where: { id }, data: { active }, select: listSelect });
}

/** Kept (with its redemptions) so the code can't be made again by mistake. */
export async function deleteGiftCode(id: string) {
  const found = await prisma.giftCode.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Gift code not found");
  await prisma.giftCode.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
}

/**
 * Pays the code's amount into the player's balance, once per player, while
 * the code still has uses left. The code row is locked for the duration so
 * two players can't both take its last use. Recorded as a BONUS from
 * "gift-code", which the database trigger counts as unplayed money: it has
 * to be staked once before it can be withdrawn.
 */
export async function redeemGiftCode(userId: string, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!code) throw new ApiError(400, "Please enter the gift code.");
  await assertCanTransact(userId);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; amount: Prisma.Decimal; maxUses: number; usedCount: number; active: boolean; deletedAt: Date | null }[]>`
      SELECT id, amount, "maxUses", "usedCount", active, "deletedAt" FROM "GiftCode" WHERE code = ${code} FOR UPDATE`;
    const giftCode = rows[0];
    if (!giftCode || giftCode.deletedAt || !giftCode.active) throw new ApiError(404, "This gift code is not valid.");

    const already = await tx.giftCodeRedemption.findUnique({ where: { giftCodeId_userId: { giftCodeId: giftCode.id, userId } }, select: { id: true } });
    if (already) throw new ApiError(409, "You have already used this gift code.");
    if (giftCode.usedCount >= giftCode.maxUses) throw new ApiError(409, "This gift code has already been fully claimed.");

    await tx.giftCodeRedemption.create({ data: { giftCodeId: giftCode.id, userId, amount: giftCode.amount } });
    await tx.giftCode.update({ where: { id: giftCode.id }, data: { usedCount: { increment: 1 } } });
    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: { balance: { increment: giftCode.amount } },
      create: { userId, balance: giftCode.amount },
    });
    await tx.transaction.create({ data: { userId, type: "BONUS", amount: giftCode.amount, status: "COMPLETED", provider: "gift-code" } });
    return { amount: Number(giftCode.amount), balance: Number(wallet.balance) };
  });
}

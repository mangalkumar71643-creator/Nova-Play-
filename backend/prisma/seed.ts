import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

function randomFiveDigitUid(): number {
  return Math.floor(10000 + Math.random() * 90000);
}

function isUidConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (err.meta?.target as string[] | undefined)?.includes("uid")
  );
}

/** Every account (fresh or pre-existing) ends up with a unique 5-digit
 * uid — this reruns on every deploy (see vercel.json's buildCommand), so
 * it only ever touches rows that don't have one yet. */
async function backfillUids() {
  const withoutUid = await prisma.user.findMany({ where: { uid: null }, select: { id: true } });
  for (const { id } of withoutUid) {
    for (let attempt = 1; attempt <= 25; attempt++) {
      try {
        await prisma.user.update({ where: { id }, data: { uid: randomFiveDigitUid() } });
        break;
      } catch (err) {
        if (!isUidConflict(err) || attempt === 25) throw err;
      }
    }
  }
  if (withoutUid.length > 0) {
    console.log(`Backfilled uid for ${withoutUid.length} existing account(s).`);
  }
}

async function main() {
  // A default admin only on a brand-new database. Once any admin exists (even
  // after it changes its email from the panel's Settings), this never runs again,
  // so the well-known default login can't come back.
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { email: true, uid: true } });
  if (existingAdmin) {
    console.log(`Admin exists: ${existingAdmin.email ?? `uid ${existingAdmin.uid}`}`);
  } else {
    const admin = await prisma.user.create({
      data: {
        uid: randomFiveDigitUid(),
        email: "admin@novaplay.test",
        passwordHash: await hashPassword("ChangeMe123!"),
        firstName: "Nova",
        lastName: "Admin",
        dateOfBirth: new Date("1990-01-01"),
        country: "GB",
        role: "ADMIN",
        kycStatus: "APPROVED",
        wallet: { create: { balance: 0 } },
      },
    });
    console.log(`Admin ready: ${admin.email} / ChangeMe123! (change this immediately)`);
  }

  await backfillUids();
  await seedDepositBonusPopup();
  await ensureUnplayedDepositTrigger();
  await ensureManualReferenceIndex();
  await ensureStockpayOrderIndex();
  await zeroAllWalletsOnce();
}

/**
 * The owner's one-time reset (2026-10-21, before any real player): every
 * wallet goes to zero — balance, locked bonus, wagering and unplayed money —
 * with a BALANCE_RESET row for what was removed, and withdrawals still
 * waiting for the admin (not sent to a payment company) are cancelled
 * without a refund, so none of that money can be paid out. Marked done in
 * Setting, so later deploys never run it again.
 */
const WALLET_RESET_KEY = "walletReset:2026-10-21";
async function zeroAllWalletsOnce() {
  await prisma.$transaction(
    async (tx) => {
      // Two builds at once: the second waits here, then finds it done.
      await tx.$executeRawUnsafe(`LOCK TABLE "Wallet" IN EXCLUSIVE MODE`);
      if (await tx.setting.findUnique({ where: { key: WALLET_RESET_KEY } })) return;
      const wallets = await tx.wallet.findMany({ select: { userId: true, balance: true } });
      let cleared = 0;
      for (const w of wallets) {
        if (Number(w.balance) > 0) {
          await tx.transaction.create({ data: { userId: w.userId, type: "BALANCE_RESET", amount: w.balance, status: "COMPLETED", provider: "owner-reset" } });
          cleared += 1;
        }
      }
      await tx.wallet.updateMany({ data: { balance: 0, lockedBonus: 0, wageringRequired: 0, wageringProgress: 0, unplayedDeposit: 0 } });
      const cancelled = await tx.transaction.updateMany({ where: { type: "WITHDRAWAL", status: "PENDING", provider: null }, data: { status: "FAILED", provider: "owner-reset" } });
      await tx.setting.create({ data: { key: WALLET_RESET_KEY, value: new Date().toISOString() } });
      console.log(`Wallet reset: ${cleared} balance(s) cleared to zero, ${cancelled.count} pending withdrawal(s) cancelled.`);
    },
    { timeout: 120000 }
  );
}

/**
 * One StockPay order = one deposit row, so a paid order can never be
 * credited twice (see stockpayService.ts createUpiCheckout). Logged, not
 * fatal, if old duplicate rows stop it being built.
 */
async function ensureStockpayOrderIndex() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS novaplay_stockpay_order
      ON "Transaction" ("providerReferenceId")
      WHERE provider = 'stockpay' AND type = 'DEPOSIT';
    `);
    // Live-pilot (real money) deposits, provider 'stockpay_live'.
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS novaplay_stockpay_live_order
      ON "Transaction" ("providerReferenceId")
      WHERE provider = 'stockpay_live' AND type = 'DEPOSIT';
    `);
    // RupayEx: one order = one deposit row, one payout id = one withdrawal
    // (see rupayexService.ts).
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS novaplay_rupayex_order
      ON "Transaction" (type, "providerReferenceId")
      WHERE provider = 'rupayex';
    `);
  } catch (err) {
    console.error("Could not create the StockPay order index (duplicate rows?):", err);
  }
}

/**
 * A deposit or payout the admin records by hand carries the payment's UTR /
 * reference; this index makes the database refuse the same reference twice
 * (see admin.routes.ts manual-deposit / manual-withdraw), even from two
 * clicks at once. Recreated on every deploy, like the trigger below.
 */
async function ensureManualReferenceIndex() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS novaplay_manual_reference
    ON "Transaction" (type, lower("providerReferenceId"))
    WHERE provider = 'admin-manual' AND status = 'COMPLETED' AND "providerReferenceId" IS NOT NULL;
  `);
}

/**
 * Keeps Wallet."unplayedDeposit" in step with the money flowing in and out,
 * inside the same database transaction as each write: deposits, admin
 * credits, gift codes, VIP bonuses and agent rewards add to it when they complete, stakes use it up first. Recreated on
 * every deploy, so changes here take effect with the next build.
 */
async function ensureUnplayedDepositTrigger() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION novaplay_track_unplayed_deposit() RETURNS trigger AS $$
    BEGIN
      IF NEW.status = 'COMPLETED'
         AND (NEW.type = 'DEPOSIT' OR (NEW.type = 'BONUS' AND NEW.provider IN ('admin-credit', 'gift-code', 'vip-upgrade', 'vip-weekly', 'agent-reward')))
         AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETED') THEN
        UPDATE "Wallet" SET "unplayedDeposit" = "unplayedDeposit" + NEW.amount WHERE "userId" = NEW."userId";
      ELSIF TG_OP = 'INSERT' AND NEW.type IN ('GAME_STAKE', 'BET_STAKE', 'DEPOSIT_REVERSAL') THEN
        UPDATE "Wallet" SET "unplayedDeposit" = GREATEST(0, "unplayedDeposit" - NEW.amount) WHERE "userId" = NEW."userId";
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS novaplay_unplayed_deposit ON "Transaction";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER novaplay_unplayed_deposit
    AFTER INSERT OR UPDATE OF status ON "Transaction"
    FOR EACH ROW EXECUTE FUNCTION novaplay_track_unplayed_deposit();
  `);
}

/**
 * The first home-screen popup, so the app keeps showing it once popups come
 * from the admin panel. Created once under a fixed id; after that the admin
 * owns it (a deleted popup keeps its row, so this never brings it back).
 */
async function seedDepositBonusPopup() {
  const image = readFileSync(join(__dirname, "seed-assets", "deposit-bonus-popup.webp"));
  await prisma.popup.upsert({
    where: { id: "seed-deposit-bonus" },
    update: {},
    create: { id: "seed-deposit-bonus", title: "Deposit bonus 7% + 5%", image, mimeType: "image/webp", width: 832, height: 1248, sortOrder: 0 },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

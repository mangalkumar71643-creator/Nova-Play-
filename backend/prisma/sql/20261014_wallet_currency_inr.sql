-- One-time currency switch: wallets are rupee-denominated (INR) now that
-- deposits run through StockPay's UPI checkout. Safe for the demo data this
-- project ships with; take a backup first if a database holds real balances.
--
-- Apply with:  psql "$DATABASE_URL" -f prisma/sql/20261014_wallet_currency_inr.sql

ALTER TABLE "Wallet" ALTER COLUMN "currency" SET DEFAULT 'INR';
UPDATE "Wallet" SET "currency" = 'INR' WHERE "currency" <> 'INR';

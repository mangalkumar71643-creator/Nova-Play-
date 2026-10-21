import crypto from "crypto";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { completeDeposit } from "./depositService";

/**
 * UPI deposits through StockPay's hosted INR checkout, written against its
 * API reference (stockpay-in.vercel.app/docs, read 2026-10-14).
 *
 * StockPay supports INR by UPI only — no cards, no other currencies
 * (currency != "INR" -> 400 unsupported_currency). Amounts are in rupees
 * ("499.00"); StockPay allows ₹100..₹99,999 per order, and the app's cap
 * below matches that maximum.
 *
 * Flow: the app asks for a checkout -> POST /orders creates StockPay's
 * hosted payment page and a PENDING DEPOSIT row is written with the order
 * id -> the player pays there with any UPI app -> the order is settled
 * when StockPay's signed order.paid webhook arrives, or when the app asks
 * to confirm (on return to the app, or the next visit to Deposit). Either
 * way the order is fetched back from StockPay (GET /orders/{id}) and only
 * a paid order of the key's own mode (test or live), in this amount and in
 * INR, claims the PENDING row and credits the wallet — once.
 *
 * Settings (Vercel -> Settings -> Environment Variables):
 *   STOCKPAY_KEY             StockPay TEST key (sk_test_...); STOCK_KEY is read too
 *   STOCKPAY_LIVE_KEY        StockPay LIVE key (sk_live_...); stockpay_key_live is read too
 *   STOCKPAY_MODE            "live" uses the live key (live PILOT); anything else the test key
 *   STOCKPAY_TEST_PHONES     phone numbers allowed to deposit, comma separated
 *                            (in both modes; empty = nobody)
 *   STOCKPAY_WEBHOOK_SECRET  webhook secret from StockPay admin -> API Keys
 *
 * Webhook: register https://<your-server>/webhooks/stockpay in StockPay's
 * admin. StockPay signs it as sha256=HMAC_SHA256(secret, timestamp + "." +
 * rawBody) in X-StockPay-Signature / X-StockPay-Timestamp (5-minute
 * tolerance) and sends order.paid / order.expired / order.cancelled.
 *
 * Test mode: a test order's "Simulate successful payment" button puts play
 * money in the wallet, so only STOCKPAY_TEST_PHONES may deposit.
 *
 * Live PILOT (sk_live_ key): real money, still only for the numbers in
 * STOCKPAY_TEST_PHONES — every other player is told UPI deposits are not
 * open yet. It is for the owner's own real-payment test; opening it to all
 * players needs a gambling licence and a payment company that allows it.
 * Live deposits are recorded as provider "stockpay_live" and test ones as
 * "stockpay", and a key only ever credits orders of its own mode, so test
 * play money and real money never mix.
 */

const BASE = "https://stockpay-in.vercel.app/api/v1";
const CURRENCY = "INR";
/** Test-mode deposits (play money). */
export const PROVIDER = "stockpay";
/** Live-pilot deposits (real money). */
export const LIVE_PROVIDER = "stockpay_live";
export const STOCKPAY_PROVIDERS = [PROVIDER, LIVE_PROVIDER];
export const MIN_UPI_DEPOSIT = 100;
// Kept well under StockPay's own ₹99,999 per-order maximum.
export const MAX_UPI_DEPOSIT = 5000;
// StockPay: an expired order can still turn paid within 24 h (late payment).
const LATE_PAYMENT_WINDOW_MS = 25 * 3600 * 1000;

type Mode = "test" | "live";
/** STOCKPAY_MODE=live picks the live key; otherwise the test key. Its prefix sets the mode. */
function rawKey(): string {
  const live = (process.env.STOCKPAY_MODE ?? "").trim().toLowerCase() === "live";
  const key = live ? process.env.STOCKPAY_LIVE_KEY || process.env.stockpay_key_live : process.env.STOCKPAY_KEY || process.env.STOCK_KEY;
  return (key ?? "").trim();
}
/** The key in use and its mode; a key that is neither sk_test_ nor sk_live_ counts as none. */
function activeKey(): { key: string; mode: Mode } | null {
  const key = rawKey();
  if (key.startsWith("sk_test_")) return { key, mode: "test" };
  if (key.startsWith("sk_live_")) return { key, mode: "live" };
  return null;
}
const providerFor = (mode: Mode) => (mode === "live" ? LIVE_PROVIDER : PROVIDER);

function allowedPhones(): string[] {
  return (process.env.STOCKPAY_TEST_PHONES ?? "")
    .split(/[\s,]+/)
    .map((p) => p.replace(/\D/g, "").slice(-10))
    .filter((p) => p.length === 10);
}

type StockpayOrder = {
  id: string;
  reference?: string;
  status: "pending" | "paid" | "expired" | "cancelled" | string;
  amount?: string;
  // Live mode adds up to ₹0.99 so each payment can be told apart; the payer pays this.
  amount_payable?: string;
  amount_paid: string | null;
  currency: string;
  utr?: string | null;
  payment_url?: string;
  test?: boolean;
};

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = activeKey()?.key;
  if (!key) throw new ApiError(503, "UPI payments are not set up yet.");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error("[stockpay] request failed:", err);
    throw new ApiError(502, "Could not reach the payment service. Please try again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
  if (!res.ok) {
    const reason = json.error?.message ?? json.error?.code ?? `HTTP ${res.status}`;
    console.error(`[stockpay] ${method} ${path} -> ${res.status}: ${reason}`);
    throw new ApiError(502, `Payment service error: ${reason}`);
  }
  return json;
}

/** What the app needs to know to offer UPI deposits to this player. */
export async function upiDepositStatus(userId: string) {
  const active = activeKey();
  if (!active) return { enabled: false, gateway: null, gatewayName: null, testMode: false, reason: "UPI payments are not set up yet." };
  const testMode = active.mode === "test";
  const base = { gateway: PROVIDER, gatewayName: "StockPay", testMode };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  const phone = (user.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!testMode) {
    // Live pilot (real money): only an account whose phone is exactly +91 and
    // a listed number, and only while OTP really goes by SMS — with mock OTP
    // anyone could sign in as that number. Everyone else finds UPI not open.
    const listed = allowedPhones().map((p) => `+91${p}`);
    if (env.smsProviderMode !== "live" || !listed.includes(user.phone ?? "")) {
      return { ...base, enabled: false, reason: "UPI deposits are not open yet." };
    }
  } else if (!allowedPhones().includes(phone)) {
    return { ...base, enabled: false, reason: `UPI payments are in test mode. This account's number (…${phone.slice(-4) || "none"}) is not in STOCKPAY_TEST_PHONES.` };
  }
  return { ...base, enabled: true, reason: null, min: MIN_UPI_DEPOSIT, max: MAX_UPI_DEPOSIT, currency: CURRENCY.toLowerCase() };
}

/** Opens a StockPay UPI payment page for `amount` (INR) and records the PENDING deposit. */
export async function createUpiCheckout(userId: string, amount: number, returnBase: string) {
  const status = await upiDepositStatus(userId);
  const active = activeKey();
  if (!status.enabled || !active) throw new ApiError(403, status.reason ?? "UPI payments are not available.");
  const provider = providerFor(active.mode);
  if (amount < MIN_UPI_DEPOSIT || amount > MAX_UPI_DEPOSIT) throw new ApiError(400, `Deposit must be between ₹${MIN_UPI_DEPOSIT} and ₹${MAX_UPI_DEPOSIT}.`);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  const order = await call<StockpayOrder>("POST", "/orders", {
    amount: amount.toFixed(2),
    currency: CURRENCY,
    // StockPay returns the existing order for a reference it has seen, so
    // two checkouts in the same millisecond must not share one.
    reference: `np-${userId.slice(0, 8)}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    note: "NovaPlay wallet deposit",
    // Lets StockPay pre-fill the payer's details on the UPI payment page.
    customer: user.phone ? { phone: user.phone } : undefined,
    // StockPay adds ?order_id=…&reference=…&status=… itself, so no query here.
    return_url: `${returnBase}/wallet/upi/return`,
  });
  if (!order.id || !order.payment_url) throw new ApiError(502, "The payment service did not return a payment page.");

  // One StockPay order = one deposit row (also enforced by a unique index,
  // see prisma/seed.ts), so a paid order can only ever be credited once.
  const existing = await prisma.transaction.findFirst({ where: { provider, type: "DEPOSIT", providerReferenceId: order.id } });
  if (!existing) {
    try {
      await prisma.transaction.create({
        data: { userId, type: "DEPOSIT", amount, status: "PENDING", provider, providerReferenceId: order.id },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  } else if (existing.userId !== userId) {
    throw new ApiError(409, "This payment page belongs to another account. Please try again.");
  }
  return { sessionId: order.id, url: order.payment_url, gateway: PROVIDER };
}

/**
 * Looks one open deposit up with StockPay: paid -> credited (exactly once),
 * expired/cancelled -> FAILED, else left PENDING. A FAILED row can still be
 * credited if StockPay later reports the order paid (a late payment).
 */
async function settle(tx: { id: string; userId: string; amount: unknown; status?: string; provider?: string | null; providerReferenceId: string | null }) {
  const amount = Number(tx.amount);
  const active = activeKey();
  if (!active) throw new ApiError(503, "UPI payments are not set up yet.");
  const provider = providerFor(active.mode);
  // A row from the other mode (opened before the key was switched) is never
  // settled with this key.
  if (tx.provider && tx.provider !== provider) throw new ApiError(409, "This deposit was opened in the other StockPay mode.");
  const order = await call<StockpayOrder>("GET", `/orders/${encodeURIComponent(tx.providerReferenceId!)}`);
  // A test key credits only test orders, a live key only real ones.
  if (order.test !== (active.mode === "test")) throw new ApiError(400, active.mode === "test" ? "Only StockPay test payments are accepted." : "Test payments are not accepted with a live key.");

  if (order.status === "paid") {
    // The order must be for this deposit's amount; what was paid may carry
    // StockPay's identifying paise on top (amount_payable, under ₹1 extra).
    // The wallet is credited the deposit's amount.
    const wantMinor = Math.round(amount * 100);
    const orderMinor = order.amount != null ? Math.round(Number(order.amount) * 100) : wantMinor;
    const paidMinor = Math.round(Number(order.amount_paid) * 100);
    if (orderMinor !== wantMinor || !(paidMinor >= wantMinor && paidMinor < wantMinor + 100) || (order.currency ?? "").toUpperCase() !== CURRENCY) {
      console.error(`[stockpay] amount mismatch on ${order.id}: order ${order.amount}, paid ${order.amount_paid} ${order.currency} vs ${amount} ${CURRENCY}`);
      throw new ApiError(400, "The paid amount does not match this deposit. Please contact support.");
    }
    const done = await completeDeposit(tx.userId, amount, provider, order.id, tx.id);
    // Reversed by the admin, or too old to credit: stays uncredited.
    if (done.refused) return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
    return { status: "COMPLETED" as const, amount, bonus: done.bonus, alreadyCredited: done.alreadyCompleted };
  }
  if (order.status === "expired" || order.status === "cancelled") {
    await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
  }
  if (tx.status === "FAILED") return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
  return { status: "PENDING" as const, amount, bonus: 0, alreadyCredited: false };
}

/** Open rows worth asking StockPay about: PENDING ones, and FAILED ones young enough for a late payment. */
async function openRows(where: { userId?: string }, mode: Mode, takePending: number, takeFailed: number) {
  const base = { ...where, type: "DEPOSIT" as const, provider: providerFor(mode), reversedAt: null };
  const [pending, failed] = await Promise.all([
    // A payment page lives 15 minutes by default and is paid within a day
    // at the latest, so an older order is never asked about again.
    prisma.transaction.findMany({
      where: { ...base, status: "PENDING", createdAt: { gte: new Date(Date.now() - LATE_PAYMENT_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: takePending,
    }),
    prisma.transaction.findMany({
      where: { ...base, status: "FAILED", createdAt: { gte: new Date(Date.now() - LATE_PAYMENT_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: takeFailed,
    }),
  ]);
  return [...pending, ...failed];
}

/**
 * Settles this player's open UPI deposits (or just `sessionId`), most
 * recent first. A row the webhook already credited is reported as
 * COMPLETED (alreadyCredited) when asked for by `sessionId`, so the app can
 * still say the deposit arrived.
 */
export async function confirmUpiDeposits(userId: string, sessionId?: string) {
  const active = activeKey();
  if (!active) return { results: [] };
  const rows = sessionId
    ? // One payment page = one deposit row.
      await prisma.transaction.findMany({ where: { userId, type: "DEPOSIT", provider: providerFor(active.mode), providerReferenceId: sessionId }, take: 1 })
    : await openRows({ userId }, active.mode, 10, 3);
  const results = [];
  for (const tx of rows) {
    if (tx.status === "COMPLETED") {
      results.push({ status: "COMPLETED" as const, amount: Number(tx.amount), bonus: 0, alreadyCredited: true });
      continue;
    }
    if (tx.status === "FAILED" && Date.now() - tx.createdAt.getTime() >= LATE_PAYMENT_WINDOW_MS) {
      results.push({ status: "FAILED" as const, amount: Number(tx.amount), bonus: 0, alreadyCredited: false });
      continue;
    }
    try {
      results.push(await settle(tx));
    } catch (err) {
      // One bad order (e.g. a mismatch for support to look at) must not stop the others.
      if (sessionId) throw err;
      console.error(`[stockpay] could not settle ${tx.providerReferenceId}:`, (err as Error).message);
    }
  }
  return { results };
}

/**
 * StockPay's signed webhook (order.paid / order.expired / order.cancelled).
 * Checks the signature (sha256=HMAC_SHA256(secret, timestamp + "." +
 * rawBody), at most 5 minutes old), then settles the matching PENDING
 * deposit by fetching the order back from StockPay — the webhook body
 * itself is never trusted for the amount.
 */
export async function handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
  const secret = (process.env.STOCKPAY_WEBHOOK_SECRET ?? "").trim();
  if (!secret) throw new ApiError(503, "Webhook secret is not set.");
  const ts = String(headers["x-stockpay-timestamp"] ?? "");
  const sig = String(headers["x-stockpay-signature"] ?? "");
  if (!ts || !Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new ApiError(400, "Stale or missing timestamp.");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${rawBody.toString("utf8")}`).digest("hex");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new ApiError(401, "Bad signature.");

  let event: { event?: string; order?: { id?: string } };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "Bad JSON.");
  }
  const orderId = event.order?.id;
  const active = activeKey();
  if (!orderId || !active) return { ignored: true };
  const provider = providerFor(active.mode);

  // A payment page that lapsed or was cancelled fails its open deposit row.
  if (event.event === "order.expired" || event.event === "order.cancelled") {
    await prisma.transaction.updateMany({
      where: { provider, providerReferenceId: orderId, type: "DEPOSIT", status: "PENDING" },
      data: { status: "FAILED" },
    });
    return { failed: true };
  }

  if (event.event !== "order.paid") return { ignored: true };
  // FAILED too: an order that expired can still be paid late.
  const tx = await prisma.transaction.findFirst({
    where: { provider, providerReferenceId: orderId, type: "DEPOSIT", status: { in: ["PENDING", "FAILED"] }, reversedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!tx) return { ignored: true };
  return settle(tx);
}

/**
 * Safety net for a missed webhook: re-checks open PENDING deposits with
 * StockPay and settles them. Runs on every server cold start (see app.ts)
 * and whenever a player opens the Deposit screen (see
 * wallet.routes.ts GET /upi/status), throttled to once a minute per
 * instance — on Vercel's serverless deploys that together covers "about
 * every hour" without a paid cron.
 */
let lastSweepAt = 0;
export async function sweepStaleUpiDeposits(force = false) {
  const active = activeKey();
  if (!active) return;
  if (!force && Date.now() - lastSweepAt < 60_000) return;
  lastSweepAt = Date.now();
  // Give a brand-new payment page a few minutes before poking StockPay.
  const rows = (await openRows({}, active.mode, 20, 10)).filter((tx) => Date.now() - tx.createdAt.getTime() > 5 * 60_000);
  for (const tx of rows) {
    try {
      await settle(tx);
    } catch (err) {
      console.error(`[stockpay] sweep could not settle ${tx.providerReferenceId}:`, (err as Error).message);
    }
  }
}

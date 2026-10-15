import crypto from "crypto";
import { prisma } from "../db/prismaClient";
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
 * a paid test order, in this amount and in INR, claims the PENDING row
 * and credits the wallet — once.
 *
 * Settings (Vercel -> Settings -> Environment Variables):
 *   STOCKPAY_KEY             StockPay secret TEST key (sk_test_...)
 *   STOCKPAY_TEST_PHONES     phone numbers allowed to deposit in test mode, comma separated
 *   STOCKPAY_WEBHOOK_SECRET  webhook secret from StockPay admin -> API Keys
 *
 * Webhook: register https://<your-server>/webhooks/stockpay in StockPay's
 * admin. StockPay signs it as sha256=HMAC_SHA256(secret, timestamp + "." +
 * rawBody) in X-StockPay-Signature / X-StockPay-Timestamp (5-minute
 * tolerance) and sends order.paid / order.expired / order.cancelled.
 *
 * Only TEST keys are switched on: a test order's "Simulate successful payment"
 * button would otherwise put play money in real players' wallets, and taking
 * real money for gambling needs a gambling licence and a payment company
 * that allows it. In test mode only STOCKPAY_TEST_PHONES may deposit.
 */

const BASE = "https://stockpay-in.vercel.app/api/v1";
const CURRENCY = "INR";
export const PROVIDER = "stockpay";
export const MIN_UPI_DEPOSIT = 100;
// StockPay's own per-order maximum.
export const MAX_UPI_DEPOSIT = 99999;

const rawKey = () => (process.env.STOCKPAY_KEY ?? "").trim();
const testKey = () => (rawKey().startsWith("sk_test_") ? rawKey() : "");

function testPhones(): string[] {
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
  amount_paid: string | null;
  currency: string;
  utr?: string | null;
  payment_url?: string;
  test?: boolean;
};

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = testKey();
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
  const base = { gateway: PROVIDER, gatewayName: "StockPay", testMode: true };
  if (rawKey().startsWith("sk_live_")) {
    return { ...base, enabled: false, testMode: false, reason: "Live UPI payments are switched off. Use a StockPay test key (sk_test_...)." };
  }
  if (!testKey()) return { ...base, enabled: false, gateway: null, gatewayName: null, testMode: false, reason: "UPI payments are not set up yet." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  const phone = (user.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!testPhones().includes(phone)) {
    return { ...base, enabled: false, reason: `UPI payments are in test mode. This account's number (…${phone.slice(-4) || "none"}) is not in STOCKPAY_TEST_PHONES.` };
  }
  return { ...base, enabled: true, reason: null, min: MIN_UPI_DEPOSIT, max: MAX_UPI_DEPOSIT, currency: CURRENCY.toLowerCase() };
}

/** Opens a StockPay UPI payment page for `amount` (INR) and records the PENDING deposit. */
export async function createUpiCheckout(userId: string, amount: number, returnBase: string) {
  const status = await upiDepositStatus(userId);
  if (!status.enabled) throw new ApiError(403, status.reason ?? "UPI payments are not available.");
  if (amount < MIN_UPI_DEPOSIT || amount > MAX_UPI_DEPOSIT) throw new ApiError(400, `Deposit must be between ₹${MIN_UPI_DEPOSIT} and ₹${MAX_UPI_DEPOSIT}.`);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  const order = await call<StockpayOrder>("POST", "/orders", {
    amount: amount.toFixed(2),
    currency: CURRENCY,
    reference: `np-${userId.slice(0, 8)}-${Date.now()}`,
    note: "NovaPlay wallet deposit",
    // Lets StockPay pre-fill the payer's details on the UPI payment page.
    customer: user.phone ? { phone: user.phone } : undefined,
    // StockPay adds ?order_id=…&reference=…&status=… itself, so no query here.
    return_url: `${returnBase}/wallet/upi/return`,
  });
  if (!order.id || !order.payment_url) throw new ApiError(502, "The payment service did not return a payment page.");

  await prisma.transaction.create({
    data: { userId, type: "DEPOSIT", amount, status: "PENDING", provider: PROVIDER, providerReferenceId: order.id },
  });
  return { sessionId: order.id, url: order.payment_url, gateway: PROVIDER };
}

/** Looks one PENDING deposit up with StockPay: paid -> credited (exactly once), expired/cancelled -> FAILED, else left PENDING. */
async function settle(tx: { id: string; userId: string; amount: unknown; providerReferenceId: string | null }) {
  const amount = Number(tx.amount);
  const order = await call<StockpayOrder>("GET", `/orders/${encodeURIComponent(tx.providerReferenceId!)}`);
  // Test keys only: an order that isn't a test order is never credited here.
  if (order.test !== true) throw new ApiError(400, "Only StockPay test payments are accepted.");

  if (order.status === "paid") {
    const paidMinor = Math.round(Number(order.amount_paid) * 100);
    if (paidMinor !== Math.round(amount * 100) || (order.currency ?? "").toUpperCase() !== CURRENCY) {
      console.error(`[stockpay] amount mismatch on ${order.id}: ${order.amount_paid} ${order.currency} vs ${amount} ${CURRENCY}`);
      throw new ApiError(400, "The paid amount does not match this deposit. Please contact support.");
    }
    const done = await completeDeposit(tx.userId, amount, PROVIDER, order.id, tx.id);
    return { status: "COMPLETED" as const, amount, bonus: done.bonus, alreadyCredited: done.alreadyCompleted };
  }
  if (order.status === "expired" || order.status === "cancelled") {
    await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
  }
  return { status: "PENDING" as const, amount, bonus: 0, alreadyCredited: false };
}

/**
 * Settles this player's open UPI deposits (or just `sessionId`), most
 * recent first. A row the webhook already credited is reported as
 * COMPLETED (alreadyCredited) when asked for by `sessionId`, so the app can
 * still say the deposit arrived.
 */
export async function confirmUpiDeposits(userId: string, sessionId?: string) {
  if (!testKey()) return { results: [] };
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      type: "DEPOSIT",
      provider: PROVIDER,
      // A payment page lives 30 minutes, so an open row is settled the first
      // time anyone looks; the window only bounds the work per request.
      ...(sessionId
        ? { providerReferenceId: sessionId, status: { in: ["PENDING", "COMPLETED"] } }
        : { status: "PENDING", createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } }),
    },
    orderBy: { createdAt: "desc" },
    // One payment page = one deposit row.
    take: sessionId ? 1 : 10,
  });
  const results = [];
  for (const tx of rows) {
    if (tx.status === "COMPLETED") {
      results.push({ status: "COMPLETED" as const, amount: Number(tx.amount), bonus: 0, alreadyCredited: true });
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
  if (!orderId) return { ignored: true };

  // A payment page that lapsed or was cancelled fails its open deposit row.
  if (event.event === "order.expired" || event.event === "order.cancelled") {
    await prisma.transaction.updateMany({
      where: { provider: PROVIDER, providerReferenceId: orderId, type: "DEPOSIT", status: "PENDING" },
      data: { status: "FAILED" },
    });
    return { failed: true };
  }

  if (event.event !== "order.paid") return { ignored: true };
  const tx = await prisma.transaction.findFirst({
    where: { provider: PROVIDER, providerReferenceId: orderId, type: "DEPOSIT", status: "PENDING" },
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
  if (!testKey()) return;
  if (!force && Date.now() - lastSweepAt < 60_000) return;
  lastSweepAt = Date.now();
  const rows = await prisma.transaction.findMany({
    where: {
      type: "DEPOSIT",
      provider: PROVIDER,
      status: "PENDING",
      // Give a brand-new payment page a few minutes before poking StockPay.
      createdAt: { lt: new Date(Date.now() - 5 * 60_000), gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const tx of rows) {
    try {
      await settle(tx);
    } catch (err) {
      console.error(`[stockpay] sweep could not settle ${tx.providerReferenceId}:`, (err as Error).message);
    }
  }
}

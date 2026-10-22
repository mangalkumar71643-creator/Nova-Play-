import crypto from "crypto";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { completeDeposit } from "./depositService";
import { integration } from "./integrationSettings";
import { refreshSettingsIfStale } from "./settingsService";

/**
 * UPI deposits and bank payouts through RupayEx, written against its API
 * docs (rupayex.net, Developers / API, as shared by the owner 2026-10-19).
 *
 * Deposits: POST /create-order opens RupayEx's payment page for a rupee
 * amount and our own order_id, and a PENDING DEPOSIT row is written with that
 * order_id. After paying, RupayEx sends the player's browser (and a JSON
 * callback) to redirect_url. Neither is signed, so neither is trusted: every
 * settlement fetches GET /order-status with our token, and only a SUCCESS
 * answer about this very order_id, for exactly this amount, claims the
 * PENDING row and credits the wallet — once (completeDeposit + the unique
 * index in prisma/seed.ts).
 *
 * Payouts: only when the admin presses "Pay with RupayEx" on a pending
 * withdrawal (admin.routes.ts). The row is claimed first (provider "rupayex",
 * providerReferenceId = our payout_id, or RupayEx's own id once it gives one),
 * so one withdrawal can only ever be sent once. Nothing gives a claim back
 * automatically once RupayEx may have the payout: GET /payout-status moves it
 * on (SUCCESS -> COMPLETED, REJECTED -> FAILED with the amount refunded), and
 * anything else waits for the admin, who can settle it by hand after checking
 * RupayEx's dashboard. RupayEx takes its own fee out of what it sends (the
 * owner chose: the player bears it); that fee is stored in providerFee.
 *
 * Settings:
 *   RUPAYEX_TOKEN         API token (RUPAYEX_KEY is read too; one saved from
 *                         the admin panel's Integrations card wins over both)
 *   RUPAYEX_PILOT_PHONES  numbers allowed to deposit, comma separated; the
 *                         numbers in STOCKPAY_TEST_PHONES are allowed too.
 *                         "*" opens deposits to every player (owner's
 *                         temporary testing switch)
 *
 * Real money from the first rupee — RupayEx has no test mode — so, like the
 * StockPay live pilot before it, deposits are open only to the listed numbers
 * and only while OTP really goes by SMS. Opening them to every player needs a
 * gambling licence and a payment company that allows it.
 */

// Overridable only so tests can point it at a stand-in server.
const BASE = process.env.RUPAYEX_BASE_URL || "https://rupayex.net/api";
export const PROVIDER = "rupayex";
export const MIN_UPI_DEPOSIT = 100;
// RupayEx allows up to ₹1,00,000 an order; the owner set ₹50,000 (2026-10-22).
export const MAX_UPI_DEPOSIT = 50_000;
// An order still unpaid after this long is failed; a FAILED one is re-checked
// for a while after that in case the payment lands late, and never after.
const ORDER_LIFETIME_MS = 24 * 3600 * 1000;
const LATE_PAYMENT_WINDOW_MS = 48 * 3600 * 1000;
const CALL_TIMEOUT_MS = 8000;

const FAILED_ORDER = ["FAILED", "FAILURE", "EXPIRED", "CANCELLED", "CANCELED", "REJECTED", "DECLINED"];

function token(): string {
  // RUPAYEX_KEY is the name the owner gave the variable in Vercel.
  return integration("rupayexToken") || (process.env.RUPAYEX_KEY ?? "").trim();
}

/** RUPAYEX_PILOT_PHONES="*" opens deposits to every player — for the owner's own testing only, set back to the numbers after. */
const openToAll = () => (process.env.RUPAYEX_PILOT_PHONES ?? "").trim() === "*";

function allowedPhones(): string[] {
  return `${process.env.RUPAYEX_PILOT_PHONES ?? ""},${process.env.STOCKPAY_TEST_PHONES ?? ""}`
    .split(/[\s,]+/)
    .map((p) => p.replace(/\D/g, "").slice(-10))
    .filter((p) => p.length === 10);
}

type Json = Record<string, unknown>;

/**
 * Calls RupayEx with the token as both the X-Api-Token header (the docs'
 * examples) and the user_token parameter (the docs' tables). POST bodies are
 * form-encoded like the docs' cURL examples. The token is never logged, and
 * redirects are refused so it can't be re-sent to another host. An answer
 * counts as ok only when it says status: true.
 */
async function call(method: "GET" | "POST", path: string, params: Record<string, string | number | undefined>): Promise<{ ok: boolean; httpStatus: number; json: Json }> {
  const key = token();
  if (!key) throw new ApiError(503, "UPI payments are not set up yet.");
  const form = new URLSearchParams({ user_token: key });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") form.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(method === "GET" ? `${BASE}${path}?${form}` : `${BASE}${path}`, {
      method,
      headers: { "X-Api-Token": key, Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: method === "POST" ? form.toString() : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[rupayex] ${method} ${path} failed:`, (err as Error).message);
    throw new ApiError(502, "Could not reach the payment service. Please try again.");
  }
  const parsed: unknown = await res.json().catch(() => null);
  const json = (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {}) as Json;
  const ok = res.ok && (json.status === true || json.status === "true" || json.status === 1 || json.status === "1");
  if (!ok) console.error(`[rupayex] ${method} ${path} -> ${res.status}: ${message(json)}`);
  return { ok, httpStatus: res.status, json };
}

const message = (json: Json) => String(json.message ?? json.error ?? "no message").slice(0, 300);
const upper = (v: unknown) => String(v ?? "").trim().toUpperCase();
const paise = (v: unknown) => Math.round(Number(v) * 100);
/** A whole-rupee amount as the docs write it ("1500"), paise only when there are some. */
const rupees = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
/** An answer's fields, whether RupayEx puts them at the top level or under `data`. */
const fieldsOf = (json: Json): Json => (typeof json.data === "object" && json.data !== null && !Array.isArray(json.data) ? { ...json, ...(json.data as Json) } : json);

/** The bank / UPI reference RupayEx gives for a payment, under whichever name it uses. */
function utrOf(o: Json): string | null {
  for (const k of ["utr", "UTR", "utr_number", "bank_ref", "bank_reference", "rrn", "RRN", "upi_txn_id", "txn_id", "transaction_id"]) {
    const v = o[k];
    if ((typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v).trim().slice(0, 64);
  }
  return null;
}

/** The payment page link. The docs don't show create-order's answer, so the usual names are tried. */
function paymentUrl(json: Json): string | null {
  const places = [json, json.data, json.result].filter((p): p is Json => typeof p === "object" && p !== null);
  for (const p of places) {
    for (const k of ["payment_url", "paymentUrl", "payment_link", "paymentLink", "checkout_url", "pay_url", "url", "link"]) {
      const v = p[k];
      if (typeof v === "string" && /^https:\/\//i.test(v)) return v;
    }
  }
  return null;
}

/** What the app needs to know to offer UPI deposits to this player. */
export async function upiDepositStatus(userId: string) {
  const base = { gateway: PROVIDER, gatewayName: "RupayEx", testMode: false };
  if (!token()) return { ...base, enabled: false, reason: "UPI payments are not set up yet." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  // Real money: only an account whose phone is exactly +91 and a listed
  // number, and only while OTP really goes by SMS — with mock OTP anyone
  // could sign in as that number. Everyone else finds UPI not open.
  const listed = allowedPhones().map((p) => `+91${p}`);
  if (env.smsProviderMode !== "live") return { ...base, enabled: false, reason: "UPI deposits are paused while OTP login is in test mode." };
  if (!openToAll() && !listed.includes(user.phone ?? "")) {
    // The player's own number's last digits, so the owner can see which number to add to the pilot list.
    const last4 = (user.phone ?? "").replace(/\D/g, "").slice(-4);
    return { ...base, enabled: false, reason: `UPI deposits are not open yet${last4 ? ` for this number (…${last4})` : ""}.` };
  }
  return { ...base, enabled: true, reason: null, min: MIN_UPI_DEPOSIT, max: MAX_UPI_DEPOSIT, currency: "inr" };
}

/** Opens a RupayEx payment page for `amount` (INR) and records the PENDING deposit. */
export async function createUpiCheckout(userId: string, amount: number, returnBase: string) {
  const status = await upiDepositStatus(userId);
  if (!status.enabled) throw new ApiError(403, status.reason ?? "UPI payments are not available.");
  if (amount < MIN_UPI_DEPOSIT || amount > MAX_UPI_DEPOSIT) throw new ApiError(400, `Deposit must be between ₹${MIN_UPI_DEPOSIT} and ₹${MAX_UPI_DEPOSIT}.`);

  // Our own id, unique and unguessable, so a callback can't name someone else's order by guessing.
  const orderId = `NP${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`.toUpperCase();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  // Written before the page exists, so a payment can never arrive for an order we don't know.
  await prisma.transaction.create({
    data: { userId, type: "DEPOSIT", amount, status: "PENDING", provider: PROVIDER, providerReferenceId: orderId },
  });
  const { ok, json } = await call("POST", "/create-order", {
    amount: rupees(amount),
    order_id: orderId,
    redirect_url: `${returnBase}/wallet/rupayex/return`,
    customer_mobile: (user.phone ?? "").replace(/\D/g, "").slice(-10) || undefined,
    remark1: "NovaPlay wallet deposit",
  });
  const url = ok ? paymentUrl(json) : null;
  if (!url) {
    await prisma.transaction.updateMany({ where: { provider: PROVIDER, providerReferenceId: orderId, type: "DEPOSIT", status: "PENDING" }, data: { status: "FAILED" } });
    if (ok) console.error(`[rupayex] create-order gave no payment link; answer keys: ${Object.keys(fieldsOf(json)).join(", ")}`);
    throw new ApiError(502, ok ? "The payment service did not return a payment page." : `Payment service error: ${message(json)}`);
  }
  return { sessionId: orderId, url, gateway: PROVIDER };
}

type DepositRow = { id: string; userId: string; amount: unknown; status: string; createdAt: Date; providerReferenceId: string | null };

/**
 * Looks one open deposit up with RupayEx: SUCCESS about this order for this
 * amount -> credited (exactly once), a failed status (or still unpaid after a
 * day) -> FAILED, else left as it is. A FAILED row can still be credited if
 * RupayEx later reports the order paid (a late payment).
 */
async function settle(tx: DepositRow) {
  const amount = Number(tx.amount);
  const orderId = tx.providerReferenceId!;
  const { ok, json } = await call("GET", "/order-status", { order_id: orderId });
  const o = fieldsOf(json);
  // payment_status per the docs; a string `status` is the callback's spelling of the same.
  const state = upper(o.payment_status ?? (typeof o.status === "string" && o.status !== "true" && o.status !== "1" ? o.status : ""));
  if (ok && state === "SUCCESS") {
    if (String(o.order_id ?? "") !== orderId || paise(o.amount) !== Math.round(amount * 100)) {
      console.error(`[rupayex] mismatch on ${orderId}: order ${String(o.order_id)}, amount ${String(o.amount)} vs ${amount}`);
      throw new ApiError(400, "The paid amount does not match this deposit. Please contact support.");
    }
    const done = await completeDeposit(tx.userId, amount, PROVIDER, orderId, tx.id, { paymentUtr: utrOf(o) });
    // Reversed by the admin, or too old to credit: stays uncredited.
    if (done.refused) return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
    return { status: "COMPLETED" as const, amount, bonus: done.bonus, alreadyCredited: done.alreadyCompleted };
  }
  const expired = Date.now() - tx.createdAt.getTime() > ORDER_LIFETIME_MS;
  if ((ok && FAILED_ORDER.includes(state)) || (expired && tx.status === "PENDING")) {
    await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { status: "FAILED" as const, amount, bonus: 0, alreadyCredited: false };
  }
  return { status: tx.status === "FAILED" ? ("FAILED" as const) : ("PENDING" as const), amount, bonus: 0, alreadyCredited: false };
}

/** Whether a row may still be asked about: not paid yet, not reversed by the admin, and within the late-payment window. */
const checkable = (tx: { status: string; createdAt: Date; reversedAt?: Date | null }) =>
  !tx.reversedAt && (tx.status === "PENDING" || tx.status === "FAILED") && Date.now() - tx.createdAt.getTime() < LATE_PAYMENT_WINDOW_MS;

/** Open rows worth asking RupayEx about: PENDING ones, and FAILED ones young enough for a late payment. */
async function openRows(where: { userId?: string }, takePending: number, takeFailed: number) {
  const base = { ...where, type: "DEPOSIT" as const, provider: PROVIDER, reversedAt: null };
  const since = new Date(Date.now() - LATE_PAYMENT_WINDOW_MS);
  const [pending, failed] = await Promise.all([
    prisma.transaction.findMany({ where: { ...base, status: "PENDING", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: takePending }),
    prisma.transaction.findMany({
      where: { ...base, status: "FAILED", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: takeFailed,
    }),
  ]);
  return [...pending, ...failed];
}

/** Settles this player's open RupayEx deposits (or just `sessionId`), most recent first. */
export async function confirmUpiDeposits(userId: string, sessionId?: string) {
  if (!token()) return { results: [] };
  const rows = sessionId
    ? await prisma.transaction.findMany({ where: { userId, type: "DEPOSIT", provider: PROVIDER, providerReferenceId: sessionId }, take: 1 })
    : await openRows({ userId }, 10, 3);
  const results = [];
  for (const tx of rows) {
    if (tx.status === "COMPLETED") {
      results.push({ status: "COMPLETED" as const, amount: Number(tx.amount), bonus: 0, alreadyCredited: true });
      continue;
    }
    if (!checkable(tx)) {
      results.push({ status: "FAILED" as const, amount: Number(tx.amount), bonus: 0, alreadyCredited: false });
      continue;
    }
    try {
      results.push(await settle(tx));
    } catch (err) {
      // One bad order (e.g. a mismatch for support to look at) must not stop the others.
      if (sessionId) throw err;
      console.error(`[rupayex] could not settle ${tx.providerReferenceId}:`, (err as Error).message);
    }
  }
  return { results };
}

// Each order is looked up at most this often from the unauthenticated return
// route, so replaying it can't run up calls to RupayEx with our token.
const RETURN_THROTTLE_MS = 30_000;
const lastReturnCheck = new Map<string, number>();

/**
 * RupayEx's return to redirect_url: the player's browser (GET) and its JSON
 * callback (POST) both land here. Only the order_id is taken from them; the
 * order is then looked up with RupayEx, so a forged call can at most make us
 * re-check an order that is ours.
 */
export async function handleReturn(orderId: string | undefined) {
  if (!orderId || orderId.length > 64 || !token()) return { status: null };
  const tx = await prisma.transaction.findFirst({ where: { provider: PROVIDER, type: "DEPOSIT", providerReferenceId: orderId } });
  if (!tx) return { status: null };
  if (tx.status === "COMPLETED" || !checkable(tx)) return { status: tx.status };
  const last = lastReturnCheck.get(orderId) ?? 0;
  if (Date.now() - last < RETURN_THROTTLE_MS) return { status: tx.status };
  lastReturnCheck.set(orderId, Date.now());
  if (lastReturnCheck.size > 5000) lastReturnCheck.clear();
  try {
    return { status: (await settle(tx)).status };
  } catch (err) {
    console.error(`[rupayex] return could not settle ${orderId}:`, (err as Error).message);
    return { status: tx.status };
  }
}

/**
 * The admin's deposit tracker: asks RupayEx about one deposit right now and
 * reports what it says (status, amount, UTR). If RupayEx says it was paid,
 * for this order and this amount, and it hasn't been credited, it is
 * credited now — whatever its age, since the admin is looking at this very
 * payment — but never a deposit the admin reversed.
 */
export async function adminRecheckDeposit(depositId: string) {
  if (!token()) throw new ApiError(503, "RupayEx is not set up yet (no API token).");
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: depositId } });
  if (tx.type !== "DEPOSIT" || tx.provider !== PROVIDER || !tx.providerReferenceId) throw new ApiError(400, "Only RupayEx deposits can be checked with RupayEx.");
  const { ok, json } = await call("GET", "/order-status", { order_id: tx.providerReferenceId });
  const o = fieldsOf(json);
  const state = upper(o.payment_status ?? (typeof o.status === "string" && o.status !== "true" && o.status !== "1" ? o.status : ""));
  const live = { answered: ok, state: state || null, amount: o.amount != null ? Number(o.amount) : null, utr: utrOf(o), message: ok ? null : message(json) };
  let note: string;
  if (tx.reversedAt) note = "This deposit was reversed by the admin, so it is never credited.";
  else if (tx.status === "COMPLETED") note = "Already credited to the player.";
  else if (!ok) note = "RupayEx did not answer about this order.";
  else if (state !== "SUCCESS") note = `RupayEx says ${state || "no status"}: the money has not reached us, nothing to credit.`;
  else if (String(o.order_id ?? "") !== tx.providerReferenceId || paise(o.amount) !== Math.round(Number(tx.amount) * 100)) {
    note = `RupayEx says paid, but for ${String(o.amount)} / order ${String(o.order_id)} — it doesn't match this deposit. Not credited; check RupayEx's dashboard.`;
  } else {
    const done = await completeDeposit(tx.userId, Number(tx.amount), PROVIDER, tx.providerReferenceId, tx.id, { allowOld: true, paymentUtr: live.utr });
    note = done.refused ? "Not credited (reversed)." : done.alreadyCompleted ? "Already credited to the player." : `Paid at RupayEx and now credited to the player${done.bonus ? ` (+₹${done.bonus} bonus)` : ""}.`;
  }
  const now = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id }, select: { status: true, paymentUtr: true } });
  return { status: now.status, paymentUtr: now.paymentUtr, live, note };
}

// --- Payouts (admin only) ---

// Bank names for the commonest IFSC prefixes; RupayEx wants a bank name with
// every bank payout. Anything else is sent as its IFSC bank code.
const BANKS: Record<string, string> = {
  SBIN: "State Bank of India", HDFC: "HDFC Bank", ICIC: "ICICI Bank", UTIB: "Axis Bank", PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda", CNRB: "Canara Bank", UBIN: "Union Bank of India", KKBK: "Kotak Mahindra Bank", IDIB: "Indian Bank",
  BKID: "Bank of India", IOBA: "Indian Overseas Bank", CBIN: "Central Bank of India", MAHB: "Bank of Maharashtra", UCBA: "UCO Bank",
  PSIB: "Punjab & Sind Bank", YESB: "Yes Bank", INDB: "IndusInd Bank", IDFB: "IDFC First Bank", FDRL: "Federal Bank",
  AIRP: "Airtel Payments Bank", PYTM: "Paytm Payments Bank", IPOS: "India Post Payments Bank", AUBL: "AU Small Finance Bank",
  BDBL: "Bandhan Bank", RATN: "RBL Bank", KARB: "Karnataka Bank", SIBL: "South Indian Bank", CSBK: "CSB Bank", DBSS: "DBS Bank India",
};

/** Our payout_id for a withdrawal: fixed by its id, so it can't be sent under two ids. */
export const payoutIdFor = (withdrawalId: string) => `NPW${withdrawalId.replace(/-/g, "").slice(0, 24).toUpperCase()}`;

type PayoutData = { payout_id?: string; amount?: number | string; fee?: number | string; net_amount?: number | string; status?: string };
/** A payout answer's `data` object; null when there is none (an error body is never read as a payout). */
const payoutData = (json: Json): PayoutData | null => (typeof json.data === "object" && json.data !== null && !Array.isArray(json.data) ? (json.data as PayoutData) : null);
const feeOf = (d: PayoutData) => (d.fee != null && Number.isFinite(Number(d.fee)) ? Number(d.fee) : undefined);

/**
 * Sends one pending withdrawal to the player's bank account through RupayEx.
 * `expectedAccount` is the account number the admin saw, so a player who
 * changes their bank account after the admin looked can't redirect it. The
 * row is claimed before RupayEx is called; the claim is only given back when
 * RupayEx clearly refused it and confirms it has no such payout, so a double
 * click, a retry or a timeout can never pay the same withdrawal twice.
 */
export async function sendPayout(withdrawalId: string, expectedAccount: string) {
  if (!token()) throw new ApiError(503, "RupayEx is not set up yet (no API token).");
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: withdrawalId },
    include: { user: { select: { payoutAccountHolderName: true, payoutAccountNumber: true, payoutIfsc: true } } },
  });
  if (tx.type !== "WITHDRAWAL") throw new ApiError(400, "Not a withdrawal.");
  const { payoutAccountHolderName: holder, payoutAccountNumber: account, payoutIfsc: ifsc } = tx.user;
  if (!holder || !account || !ifsc) throw new ApiError(400, "The player has no bank account saved.");
  if (account !== expectedAccount) throw new ApiError(409, "The player's bank account changed since this page was loaded. Refresh and check it again.");
  // The fee we keep comes off first; RupayEx then takes its own fee from the rest.
  const amount = Math.round((Number(tx.amount) - Number(tx.fee ?? 0)) * 100) / 100;
  if (amount < 1) throw new ApiError(400, "Nothing left to pay out after the fee.");

  const payoutId = payoutIdFor(tx.id);
  const claimed = await prisma.transaction.updateMany({
    where: { id: tx.id, type: "WITHDRAWAL", status: "PENDING", provider: null },
    data: { provider: PROVIDER, providerReferenceId: payoutId, sentAt: new Date() },
  });
  if (claimed.count === 0) throw new ApiError(400, "This withdrawal is not pending, or is already being processed.");

  let sent: Awaited<ReturnType<typeof call>>;
  try {
    sent = await call("POST", "/create-payout", {
      amount: rupees(amount),
      method: "bank",
      account_holder: holder,
      account_number: account,
      ifsc_code: ifsc,
      bank_name: BANKS[ifsc.slice(0, 4).toUpperCase()] ?? ifsc.slice(0, 4).toUpperCase(),
      payout_id: payoutId,
    });
  } catch (err) {
    // No answer: RupayEx may or may not have it, so the claim stays.
    throw new ApiError(502, `${(err as Error).message} The withdrawal stays with RupayEx — press "Check RupayEx status" in a few minutes, or settle it by hand after checking RupayEx's dashboard.`);
  }
  if (!sent.ok) {
    // A clear refusal (4xx, or 200 with status false) that RupayEx then
    // confirms it has no record of was never created: give the claim back.
    // A server error might have created it, so that keeps the claim.
    if (sent.httpStatus < 500 && (await payoutIsUnknown(payoutId))) {
      await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING", provider: PROVIDER, providerReferenceId: payoutId }, data: { provider: null, providerReferenceId: null, sentAt: null } });
      throw new ApiError(502, `RupayEx refused the payout: ${message(sent.json)}`);
    }
    throw new ApiError(502, `RupayEx answered: ${message(sent.json)}. The withdrawal stays with RupayEx — check its dashboard, then press "Check RupayEx status" or settle it by hand.`);
  }
  const data = payoutData(sent.json) ?? {};
  // RupayEx may file it under its own id; later checks must use that one.
  const rupayexId = typeof data.payout_id === "string" && data.payout_id.trim() ? data.payout_id.trim() : payoutId;
  const fee = feeOf(data);
  await prisma.transaction.update({ where: { id: tx.id }, data: { providerReferenceId: rupayexId, ...(fee !== undefined ? { providerFee: fee } : {}) } });
  return syncPayout(tx.id);
}

/**
 * True only when RupayEx itself answered, in well-formed JSON, that it has no
 * such payout. Anything else (an auth error, a proxy 404, a timeout) proves
 * nothing and counts as unknown.
 */
async function payoutIsUnknown(payoutId: string): Promise<boolean> {
  try {
    const { ok, httpStatus, json } = await call("GET", "/payout-status", { payout_id: payoutId });
    if (ok || httpStatus === 401 || httpStatus === 403 || (json.status !== false && json.status !== "false")) return false;
    const msg = message(json);
    return /payout/i.test(msg) && /not\s*found|does\s*not\s*exist|no\s*(such|record)|invalid/i.test(msg);
  } catch {
    return false;
  }
}

/**
 * Moves one RupayEx payout on from what RupayEx reports: SUCCESS -> paid,
 * REJECTED (RupayEx returned the money to our RupayEx wallet) -> refunded to
 * the player. Every other answer leaves it waiting, for RupayEx or for the
 * admin's hand settlement (settlePayoutByHand).
 */
export async function syncPayout(withdrawalId: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: withdrawalId } });
  if (tx.type !== "WITHDRAWAL" || tx.provider !== PROVIDER || !tx.providerReferenceId) throw new ApiError(400, "This withdrawal was not sent with RupayEx.");
  if (tx.status !== "PENDING") return { status: tx.status, rupayexStatus: null };
  const { ok, json } = await call("GET", "/payout-status", { payout_id: tx.providerReferenceId });
  const data = ok ? payoutData(json) : null;
  // Only an answer about this very payout is acted on.
  if (!data || (data.payout_id != null && String(data.payout_id) !== tx.providerReferenceId)) {
    return { status: "PENDING", rupayexStatus: null, note: ok ? "RupayEx's answer did not name this payout." : message(json) };
  }
  const state = upper(data.status);
  const fee = feeOf(data);
  if (state === "SUCCESS") {
    await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING", provider: PROVIDER }, data: { status: "COMPLETED", ...(fee !== undefined ? { providerFee: fee } : {}) } });
  } else if (state === "REJECTED") {
    await refundClaimed(tx.id);
  } else if (fee !== undefined) {
    await prisma.transaction.update({ where: { id: tx.id }, data: { providerFee: fee } });
  }
  const now = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id }, select: { status: true } });
  return { status: now.status, rupayexStatus: state || null, fee: fee ?? null, net: data.net_amount != null ? Number(data.net_amount) : null };
}

/** FAILED + the amount back in the player's wallet, once, for a withdrawal RupayEx holds. */
async function refundClaimed(withdrawalId: string) {
  return prisma.$transaction(async (db) => {
    const failed = await db.transaction.updateMany({ where: { id: withdrawalId, type: "WITHDRAWAL", status: "PENDING", provider: PROVIDER }, data: { status: "FAILED" } });
    if (failed.count === 0) return false;
    const tx = await db.transaction.findUniqueOrThrow({ where: { id: withdrawalId } });
    await db.wallet.update({ where: { userId: tx.userId }, data: { balance: { increment: tx.amount } } });
    await db.transaction.create({ data: { userId: tx.userId, type: "WITHDRAWAL_REVERSAL", amount: tx.amount, status: "COMPLETED" } });
    return true;
  });
}

/**
 * The admin's way out for a RupayEx payout that RupayEx won't settle (no
 * answer, an unknown status, a send that never reached it): after checking
 * RupayEx's own dashboard, mark it paid, or fail it and refund the player.
 */
export async function settlePayoutByHand(withdrawalId: string, outcome: "paid" | "refund") {
  if (outcome === "refund") {
    if (!(await refundClaimed(withdrawalId))) throw new ApiError(400, "This withdrawal is not waiting on RupayEx.");
  } else {
    const done = await prisma.transaction.updateMany({ where: { id: withdrawalId, type: "WITHDRAWAL", status: "PENDING", provider: PROVIDER }, data: { status: "COMPLETED" } });
    if (done.count === 0) throw new ApiError(400, "This withdrawal is not waiting on RupayEx.");
  }
  return prisma.transaction.findUniqueOrThrow({ where: { id: withdrawalId } });
}

/** RupayEx wallet balance, for the admin panel. */
export async function walletBalance() {
  if (!token()) return { configured: false, balance: null };
  try {
    const { ok, json } = await call("GET", "/wallet-balance", {});
    const o = fieldsOf(json);
    return { configured: true, balance: ok && o.balance != null ? Number(o.balance) : null, error: ok ? null : message(json) };
  } catch (err) {
    return { configured: true, balance: null, error: (err as Error).message };
  }
}

/**
 * Safety net for a missed callback: re-checks open deposits and RupayEx
 * payouts. Started (not awaited) on every server cold start (app.ts) and when
 * the admin lists withdrawals, throttled to once a minute per instance, and
 * stopped after a few seconds or at the first call RupayEx doesn't answer, so
 * an outage there never holds anything up.
 */
let lastSweepAt = 0;
const SWEEP_BUDGET_MS = 20_000;
export async function sweepRupayex(force = false) {
  if (!force && Date.now() - lastSweepAt < 60_000) return;
  lastSweepAt = Date.now();
  // The token may have been saved in the panel: read it the way requests do.
  await refreshSettingsIfStale();
  if (!token()) return;
  const startedAt = Date.now();
  // Give a brand-new payment page a few minutes before poking RupayEx.
  const deposits = (await openRows({}, 20, 10)).filter((tx) => Date.now() - tx.createdAt.getTime() > 5 * 60_000);
  const payouts = await prisma.transaction.findMany({ where: { type: "WITHDRAWAL", status: "PENDING", provider: PROVIDER }, orderBy: { sentAt: "desc" }, take: 20 });
  const jobs: [string, () => Promise<unknown>][] = [
    ...deposits.map((tx): [string, () => Promise<unknown>] => [`deposit ${tx.providerReferenceId}`, () => settle(tx)]),
    ...payouts.map((tx): [string, () => Promise<unknown>] => [`payout ${tx.providerReferenceId}`, () => syncPayout(tx.id)]),
  ];
  for (const [what, job] of jobs) {
    if (Date.now() - startedAt > SWEEP_BUDGET_MS) break;
    try {
      await job();
    } catch (err) {
      console.error(`[rupayex] sweep could not check ${what}:`, (err as Error).message);
      // RupayEx not answering: try again on the next sweep.
      if (err instanceof ApiError && err.status === 502) break;
    }
  }
}

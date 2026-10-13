import { env } from "../config/env";

/**
 * Reads TRON blocks from a full node HTTP API (TronGrid by default). Blocks
 * come every 3 seconds with millisecond timestamps on the 3 s grid; a slot can
 * be missed, so block numbers are only roughly proportional to time.
 */
export interface TronBlock {
  number: number;
  hash: string;
  timestamp: number;
}

const SLOT_MS = 3000;
const TIMEOUT_MS = 4000;
const NOW_BLOCK_TTL_MS = 1000;
/** A block is used only once this many blocks are built on it (~9 s), so a
 * short fork at the chain tip can't swap it for another hash later. */
export const CONFIRMATIONS = 3;
/** A public node with the same API, tried when the primary one fails or
 * rate-limits. Both serve the same chain, so they agree on every block. */
const FALLBACK_URL = "https://tron-rpc.publicnode.com";

function nodes(): string[] {
  return [...new Set([env.tron.apiUrl, FALLBACK_URL])];
}

async function callOne(base: string, path: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // The TronGrid key only ever goes to TronGrid.
  if (env.tron.apiKey && new URL(base).hostname.endsWith("trongrid.io")) headers["TRON-PRO-API-KEY"] = env.tron.apiKey;
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`TRON API ${base}${path} answered ${res.status}`);
  return res.json();
}

async function call(path: string, body: unknown): Promise<unknown> {
  let last: unknown;
  for (const base of nodes()) {
    try {
      return await callOne(base, path, body);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

function parse(raw: unknown): TronBlock | null {
  const b = raw as { blockID?: string; block_header?: { raw_data?: { number?: number; timestamp?: number } } };
  const h = b?.block_header?.raw_data;
  if (!b?.blockID || typeof h?.number !== "number" || typeof h?.timestamp !== "number") return null;
  if (!/^[0-9a-f]{64}$/i.test(b.blockID)) return null;
  return { number: h.number, hash: b.blockID.toLowerCase(), timestamp: h.timestamp };
}

/** A block header only (no transactions): about half a kilobyte. The
 * latest block when `num` is omitted. */
async function header(num?: number): Promise<TronBlock> {
  const block = parse(await call("/wallet/getblock", num === undefined ? { detail: false } : { id_or_num: String(num), detail: false }));
  if (!block || (num !== undefined && block.number !== num)) throw new Error(`TRON API returned no block ${num ?? "(latest)"}`);
  return block;
}

// The newest block is shared by every request on a warm instance for a
// moment, so a burst of result polls doesn't turn into a burst of API calls.
let nowCache: { at: number; block: TronBlock } | null = null;

async function nowBlock(): Promise<TronBlock> {
  if (nowCache && Date.now() - nowCache.at < NOW_BLOCK_TTL_MS) return nowCache.block;
  const block = await header();
  nowCache = { at: Date.now(), block };
  return block;
}

// Blocks never change once found (for our purposes), so they are remembered
// per target time on a warm instance.
const found = new Map<number, TronBlock>();

/**
 * The first block whose timestamp is at or after `t` (ms), or null while the
 * chain (as the API sees it) hasn't produced it with CONFIRMATIONS blocks on
 * top yet. Throws if the API can't be read.
 *
 * Block numbers advance by at most one per 3 s slot, so counting slots
 * back from the head gives a number at or before the answer. From there it
 * checks a block and its predecessor together and jumps by whole slots:
 * forward when both are before `t`, back (to a bound that can't pass the
 * answer) when the predecessor is already at or after it. Usually the first
 * pair is the answer.
 */
export async function firstBlockAtOrAfter(t: number): Promise<TronBlock | null> {
  const cached = found.get(t);
  if (cached) return cached;
  const head = await nowBlock();
  // The answer is stamped at or after t and needs CONFIRMATIONS blocks on
  // top, each at least one slot later: until then there is nothing to find.
  if (head.timestamp < t + CONFIRMATIONS * SLOT_MS) return null;
  let n = head.number - Math.floor((head.timestamp - t) / SLOT_MS);
  for (let step = 0; step < 60; step++) {
    n = Math.min(n, head.number);
    const [b, prev] = await Promise.all([n === head.number ? head : header(n), header(n - 1)]);
    if (prev.timestamp >= t) {
      n = n - 1 - Math.floor((prev.timestamp - t) / SLOT_MS);
      continue;
    }
    if (b.timestamp >= t) {
      if (head.number < b.number + CONFIRMATIONS) return null;
      found.set(t, b);
      if (found.size > 500) found.delete(found.keys().next().value!);
      return b;
    }
    n += Math.max(1, Math.ceil((t - b.timestamp) / SLOT_MS));
  }
  throw new Error(`Could not locate the TRON block for ${new Date(t).toISOString()}`);
}

/** The last decimal digit in a block hash, read from the end (null if the
 * hash has no digit at all, which for 64 random hex characters doesn't
 * happen in practice). Every digit is equally likely: each hex character is
 * uniform, so the first digit met from the end is uniform over 0-9. */
export function lastDigitOf(hash: string): number | null {
  for (let i = hash.length - 1; i >= 0; i--) {
    const c = hash.charCodeAt(i);
    if (c >= 48 && c <= 57) return c - 48;
  }
  return null;
}

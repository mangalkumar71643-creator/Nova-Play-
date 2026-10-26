import { prisma } from "../db/prismaClient";
import { env, NO_PAYOUT_LIMIT } from "../config/env";
import { runtimeSettings } from "../config/runtimeSettings";
import { loadIntegrationSettings } from "./integrationSettings";

/** Re-read the Setting table at most this often per server instance. */
const REFRESH_MS = 15_000;
let loadedAt = 0;

export const MIN_MAX_PAYOUT = 1000;
export const MAX_MAX_PAYOUT = NO_PAYOUT_LIMIT;
// The limit the admin sets is kept under its own key; an earlier 10,000 limit (key "maxPayout") is dropped, so by default wins are unlimited.
const MAX_PAYOUT_KEY = "maxPayoutCap";

async function load() {
  const rows = await prisma.setting.findMany({ where: { key: MAX_PAYOUT_KEY } });
  const maxPayout = Number(rows.find((r) => r.key === MAX_PAYOUT_KEY)?.value);
  runtimeSettings.maxPayout = Number.isFinite(maxPayout) && maxPayout > 0 ? maxPayout : undefined;
  await loadIntegrationSettings();
  loadedAt = Date.now();
}

/** Keeps runtimeSettings fresh; called before every request. A failed read keeps the last known values. */
export async function refreshSettingsIfStale() {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  try {
    await load();
  } catch (err) {
    loadedAt = Date.now();
    console.error("Settings refresh failed", err);
  }
}

export function getGameSettings() {
  return { maxPayout: env.games.maxPayout, maxStake: env.games.maxStake, minMaxPayout: MIN_MAX_PAYOUT, maxMaxPayout: MAX_MAX_PAYOUT };
}

export async function setMaxPayout(value: number) {
  await prisma.setting.upsert({ where: { key: MAX_PAYOUT_KEY }, update: { value: String(value) }, create: { key: MAX_PAYOUT_KEY, value: String(value) } });
  await load();
  return getGameSettings();
}

// Where the Home slider's "Download app" buttons send people playing on the website.
const APP_DOWNLOAD_URL_KEY = "appDownloadUrl";

export async function getAppDownloadUrl(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: APP_DOWNLOAD_URL_KEY } });
  return row?.value || null;
}

/** An empty value clears it. */
export async function setAppDownloadUrl(url: string) {
  if (!url) await prisma.setting.deleteMany({ where: { key: APP_DOWNLOAD_URL_KEY } });
  else await prisma.setting.upsert({ where: { key: APP_DOWNLOAD_URL_KEY }, update: { value: url }, create: { key: APP_DOWNLOAD_URL_KEY, value: url } });
  return { url: url || null };
}

// The newest released app version ("1.0.1"). The app compares its own
// version against this on startup and nudges older installs to download
// the update from the download URL above.
const LATEST_APP_VERSION_KEY = "latestAppVersion";

export async function getAppVersionInfo(): Promise<{ latestVersion: string | null; downloadUrl: string | null }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [APP_DOWNLOAD_URL_KEY, LATEST_APP_VERSION_KEY] } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value || null;
  return { latestVersion: get(LATEST_APP_VERSION_KEY), downloadUrl: get(APP_DOWNLOAD_URL_KEY) };
}

/** An empty value clears the update nudge. */
export async function setLatestAppVersion(version: string) {
  if (!version) await prisma.setting.deleteMany({ where: { key: LATEST_APP_VERSION_KEY } });
  else await prisma.setting.upsert({ where: { key: LATEST_APP_VERSION_KEY }, update: { value: version }, create: { key: LATEST_APP_VERSION_KEY, value: version } });
  return { latestVersion: version || null };
}

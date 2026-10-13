import crypto from "crypto";
import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

/**
 * SMS keys the admin enters in the panel (Integrations card),
 * so they take effect without touching Vercel or redeploying. Stored in the
 * Setting table under "int:<name>"; secret ones are encrypted at rest with a
 * key derived from JWT_SECRET and are never sent back to the panel (only
 * whether they are set and their last 4 characters). A value set here wins
 * over the matching environment variable; clearing it falls back to that.
 */
export const INTEGRATION_FIELDS = {
  smsApiKey: { env: "SMS_API_KEY", secret: true },
  smsRoute: { env: "SMS_ROUTE", secret: false },
  smsSenderId: { env: "SMS_SENDER_ID", secret: false },
  smsTemplateId: { env: "SMS_TEMPLATE_ID", secret: false },
  smsWaMessageId: { env: "SMS_WA_MESSAGE_ID", secret: false },
  smsWaPhoneNumberId: { env: "SMS_WA_PHONE_NUMBER_ID", secret: false },
  smsFallbackRoute: { env: "SMS_FALLBACK_ROUTE", secret: false },
} as const;
export type IntegrationField = keyof typeof INTEGRATION_FIELDS;
const FIELD_NAMES = Object.keys(INTEGRATION_FIELDS) as IntegrationField[];
const PREFIX = "int:";

const cipherKey = () => crypto.createHash("sha256").update(`novaplay-integrations:${env.jwtSecret}`).digest();

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["enc1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function decrypt(stored: string): string | null {
  const [tag, iv, auth, data] = stored.split(":");
  if (tag !== "enc1" || !iv || !auth || !data) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(auth, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    // JWT_SECRET changed since it was saved: treat as not set.
    return null;
  }
}

let cache: Partial<Record<IntegrationField, string>> = {};

/** Reloads the saved values; called with the other runtime settings (settingsService). */
export async function loadIntegrationSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: PREFIX } } });
  const next: Partial<Record<IntegrationField, string>> = {};
  for (const row of rows) {
    const name = row.key.slice(PREFIX.length) as IntegrationField;
    if (!(name in INTEGRATION_FIELDS)) continue;
    const value = INTEGRATION_FIELDS[name].secret ? decrypt(row.value) : row.value;
    if (value) next[name] = value;
  }
  cache = next;
}

/** The value in use: the panel's if set, else the environment variable's. */
export function integration(name: IntegrationField): string {
  return (cache[name] ?? process.env[INTEGRATION_FIELDS[name].env] ?? "").trim();
}

/** What the panel shows: plain values as they are, secrets only as set / last 4. */
export function integrationView() {
  return Object.fromEntries(
    FIELD_NAMES.map((name) => {
      const value = integration(name);
      const source = cache[name] ? "panel" : value ? "env" : null;
      return [name, INTEGRATION_FIELDS[name].secret ? { set: Boolean(value), last4: value ? value.slice(-4) : null, source } : { value: value || null, source }];
    })
  );
}

/** Saves the given fields; an empty string clears a field (back to the env value, if any). */
export async function saveIntegrationSettings(patch: Partial<Record<IntegrationField, string>>) {
  for (const name of Object.keys(patch) as IntegrationField[]) {
    if (!(name in INTEGRATION_FIELDS)) throw new ApiError(400, `Unknown setting ${name}.`);
    const value = (patch[name] ?? "").trim();
    const key = PREFIX + name;
    if (!value) {
      await prisma.setting.deleteMany({ where: { key } });
      continue;
    }
    const stored = INTEGRATION_FIELDS[name].secret ? encrypt(value) : value;
    await prisma.setting.upsert({ where: { key }, update: { value: stored }, create: { key, value: stored } });
  }
  await loadIntegrationSettings();
  return integrationView();
}

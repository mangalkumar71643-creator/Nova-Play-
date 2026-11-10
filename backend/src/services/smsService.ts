import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { integration } from "./integrationSettings";

export interface SmsProvider {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * Local-development stand-in only — no real SMS is sent. The OTP is
 * returned to the caller (see otpService.ts) so the mobile app can show
 * it on-screen for testing, the same way the old Firebase dev-fallback
 * banner worked. Never use this with real users.
 */
class MockSmsProvider implements SmsProvider {
  readonly name = "mock";

  async sendOtp(phone: string, code: string): Promise<void> {
    console.log(`[MockSmsProvider] OTP for ${phone}: ${code}`);
  }
}

/**
 * Placeholder for SMS_PROVIDER_MODE=live with no gateway configured: every
 * OTP request fails with a clear error rather than silently not sending.
 */
class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = "unconfigured";

  async sendOtp(): Promise<void> {
    throw new Error("No live SMS provider is configured — set SMS_API_KEY (Fast2SMS) before setting SMS_PROVIDER_MODE=live.");
  }
}

/**
 * Fast2SMS (India, +91 numbers only), POST https://www.fast2sms.com/dev/bulkV2
 * with the account's API key in the Authorization header. Three routes:
 * - "dlt": the DLT-approved OTP template (SMS_TEMPLATE_ID = its Message ID
 *   from Fast2SMS DLT Manager, SMS_SENDER_ID = the approved sender), the
 *   code filling its {#var#}. The proper route for live use.
 * - "otp": Fast2SMS's own fixed OTP message ("Your OTP: 123456"), the code
 *   in variables_values; no template of our own.
 * - "q" (Quick SMS): free text, no DLT setup needed — handy for a first
 *   test, but the dearest per SMS (about ₹5).
 * - "whatsapp": the code goes out as a WhatsApp authentication message
 *   (Fast2SMS WhatsApp API, GET /dev/whatsapp) instead of an SMS. No DLT
 *   needed and the cheapest per OTP; needs the WhatsApp Business number
 *   linked in Fast2SMS and an approved OTP template: SMS_WA_MESSAGE_ID is
 *   the template's Fast2SMS message ID, SMS_WA_PHONE_NUMBER_ID the linked
 *   number's Phone Number ID (both in Fast2SMS → WhatsApp Manager).
 * SMS_ROUTE picks one; by default "dlt" when a template is set, else "q".
 * SMS_FALLBACK_ROUTE (optional) is tried when the first route fails — e.g.
 * whatsapp first, then an SMS route for a number not on WhatsApp.
 */
export type Fast2SmsRoute = "dlt" | "otp" | "q" | "whatsapp";
export const FAST2SMS_ROUTES: Fast2SmsRoute[] = ["dlt", "otp", "q", "whatsapp"];

export class Fast2SmsProvider implements SmsProvider {
  readonly name = "fast2sms";

  constructor(
    private readonly apiKey: string,
    readonly route: Fast2SmsRoute,
    private readonly senderId: string,
    private readonly templateId: string,
    private readonly waMessageId = "",
    private readonly waPhoneNumberId = ""
  ) {}

  /** The 10-digit Indian number Fast2SMS wants. */
  static toLocal(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local)) throw new ApiError(400, "SMS can only be sent to Indian (+91) mobile numbers for now.");
    return local;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const numbers = Fast2SmsProvider.toLocal(phone);
    if (this.route === "whatsapp") return this.sendWhatsApp(numbers, code);
    const body =
      this.route === "dlt"
        ? { route: "dlt", sender_id: this.senderId, message: this.templateId, variables_values: code, numbers }
        : this.route === "otp"
          ? { route: "otp", variables_values: code, numbers }
          : { route: "q", message: `Your NovaPlay OTP is ${code}. It is valid for 5 minutes. Do not share it with anyone.`, numbers };

    let res: Response;
    try {
      res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error("[Fast2SMS] request failed:", err);
      throw new ApiError(502, "Could not send the SMS. Please try again.");
    }
    const json = (await res.json().catch(() => ({}))) as { return?: boolean; message?: unknown; status_code?: number };
    if (!res.ok || json.return !== true) {
      const reason = Array.isArray(json.message) ? json.message.join(" ") : String(json.message ?? `HTTP ${res.status}`);
      console.error(`[Fast2SMS] ${this.route} route refused: ${reason}`);
      throw new ApiError(502, `Could not send the SMS (${reason}).`);
    }
  }

  private async sendWhatsApp(numbers: string, code: string): Promise<void> {
    const qs = new URLSearchParams({ message_id: this.waMessageId, phone_number_id: this.waPhoneNumberId, numbers, variables_values: code });
    let res: Response;
    try {
      res = await fetch(`https://www.fast2sms.com/dev/whatsapp?${qs}`, {
        headers: { Authorization: this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error("[Fast2SMS] WhatsApp request failed:", err);
      throw new ApiError(502, "Could not send the WhatsApp code. Please try again.");
    }
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; return?: boolean; message?: unknown };
    if (!res.ok || (json.status !== true && json.return !== true)) {
      const reason = Array.isArray(json.message) ? json.message.join(" ") : String(json.message ?? `HTTP ${res.status}`);
      console.error(`[Fast2SMS] whatsapp route refused: ${reason}`);
      throw new ApiError(502, `Could not send the WhatsApp code (${reason}).`);
    }
  }
}

/** Tries `primary`, then `fallback` if it fails (e.g. WhatsApp, then SMS). */
class FallbackSmsProvider implements SmsProvider {
  readonly name: string;
  constructor(
    private readonly primary: Fast2SmsProvider,
    private readonly fallback: Fast2SmsProvider
  ) {
    this.name = `fast2sms:${primary.route}+${fallback.route}`;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    try {
      await this.primary.sendOtp(phone, code);
    } catch (err) {
      console.error(`[sms] ${this.primary.route} failed, trying ${this.fallback.route}:`, (err as Error).message);
      await this.fallback.sendOtp(phone, code);
    }
  }
}

/** The Fast2SMS sender built from the current settings (admin panel, else environment) or for `routeOverride`; null if no key is set. */
export function fast2SmsFromEnv(routeOverride?: Fast2SmsRoute): Fast2SmsProvider | null {
  const apiKey = integration("smsApiKey");
  if (!apiKey) return null;
  const templateId = integration("smsTemplateId");
  const senderId = integration("smsSenderId");
  const configured = FAST2SMS_ROUTES.find((r) => r === integration("smsRoute"));
  const route: Fast2SmsRoute = routeOverride ?? configured ?? (templateId ? "dlt" : "q");
  if (route === "dlt" && (!templateId || !senderId)) throw new Error("The DLT route needs the Sender ID and the DLT Template ID.");
  const waMessageId = integration("smsWaMessageId");
  const waPhoneNumberId = integration("smsWaPhoneNumberId");
  if (route === "whatsapp" && (!waMessageId || !waPhoneNumberId)) {
    throw new Error("The WhatsApp route needs the WhatsApp Message ID and Phone Number ID.");
  }
  return new Fast2SmsProvider(apiKey, route, senderId, templateId, waMessageId, waPhoneNumberId);
}

function liveProvider(): SmsProvider {
  try {
    const primary = fast2SmsFromEnv();
    if (!primary) return new UnconfiguredSmsProvider();
    const fallbackRoute = FAST2SMS_ROUTES.find((r) => r === integration("smsFallbackRoute"));
    if (fallbackRoute && fallbackRoute !== primary.route) return new FallbackSmsProvider(primary, fast2SmsFromEnv(fallbackRoute)!);
    return primary;
  } catch (err) {
    // A half-set configuration must not take the whole server down; OTP requests report it instead.
    console.error("[sms]", (err as Error).message);
    return new UnconfiguredSmsProvider();
  }
}

/** Built per use so keys changed in the admin panel apply at once. */
export function getSmsProvider(): SmsProvider {
  return env.smsProviderMode === "live" ? liveProvider() : new MockSmsProvider();
}

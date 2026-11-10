import { ApiError } from "../middleware/errorHandler";

/**
 * Indian mobile numbers only: 10 digits starting 6-9 (an optional +91, 91
 * or 0 in front is dropped), and not an obviously made-up one such as
 * 9999999999 or 9876543210. Sign-up and login use the number
 * with a password; this refuses a made-up number up front.
 */
export function indianMobileDigits(input: string): string | null {
  let d = String(input ?? "").replace(/[\s\-()]/g, "");
  if (d.startsWith("+91")) d = d.slice(3);
  else if (d.startsWith("+")) return null;
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  if (new Set(d).size <= 2) return null; // 9999999999, 9898989898, 9000000000
  const steps = [...d].slice(1).map((c, i) => Number(c) - Number(d[i]));
  if (steps.every((s) => s === 1 || s === -9) || steps.every((s) => s === -1 || s === 9)) return null; // 6789012345, 9876543210
  return d;
}

/** The number as +91XXXXXXXXXX, or a 400 the app shows to the player. */
export function toIndianE164(input: string): string {
  const d = indianMobileDigits(input);
  if (!d) throw new ApiError(400, "Enter a valid 10-digit Indian mobile number.");
  return `+91${d}`;
}

export function isRealIndianMobile(e164: string | null | undefined): boolean {
  return !!e164 && e164.startsWith("+91") && indianMobileDigits(e164) !== null;
}

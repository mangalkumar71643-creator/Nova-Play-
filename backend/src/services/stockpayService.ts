/**
 * StockPay is switched off for good (owner's decision, 2026-10-21): no
 * checkout, no webhook, no confirm and no sweep exists any more, so no
 * StockPay order — test or live, old or new — can ever credit a wallet.
 * Deposits come in only through RupayEx (rupayexService.ts) and the admin's
 * own manual deposits. Only the provider names stay, so past StockPay rows
 * can still be listed, flagged as test money and reversed by the admin.
 */

/** Test-mode deposits (play money). */
export const PROVIDER = "stockpay";
/** Live-pilot deposits (real money). */
export const LIVE_PROVIDER = "stockpay_live";
export const STOCKPAY_PROVIDERS = [PROVIDER, LIVE_PROVIDER];

# NovaPlay

A real-money gaming platform: one backend API shared by a mobile app (the
user's own NovaPlay app, extended with real wallet/KYC/RNG) and, later, a
web app.

## ⚠️ Legal & compliance — read before going live

This repository gives you working software. It does **not** make your
operation legally compliant. Before you accept a single real deposit from a
real customer you are responsible for:

- **Holding a genuine, verified gambling licence** for every jurisdiction you
  operate in. Verify any licence certificate directly on the regulator's
  official site (e.g. UK: https://www.gamblingcommission.gov.uk/public-register-of-licence-holders)
  — never take a certificate image at face value.
- **KYC/AML**: this codebase only wires up an *interface* for a KYC provider
  (`backend/src/services/kycService.ts`). You must contract a licensed KYC
  provider (Sumsub, Onfido, ComplyAdvantage, etc.) and implement the real
  calls — the shipped `MockKycProvider` is for local development only.
- **Payments**: gambling transactions require a payment processor licensed
  to handle gambling money (most mainstream processors, incl. plain
  Stripe/Razorpay, explicitly forbid gambling in their ToS). The shipped
  `MockPaymentProvider` is a local stand-in only — swap in a real gambling
  payment processor before going live.
- **Responsible gambling controls** (deposit limits, self-exclusion, reality
  checks) are scaffolded here because most licences make them mandatory, but
  you must review the exact rules your licence requires and adjust.
- **Age verification / geo-restriction**: the backend rejects signups under
  18 and stores country, but real jurisdictional blocking (IP geolocation,
  license-territory enforcement) is not implemented and must be added.
- **Independent legal review**: get a gambling-law solicitor to review the
  product before launch. This is a heavily regulated industry and the
  consequences of operating without a valid licence are criminal, not just
  civil.
- **RNG certification**: the "Games" section in the mobile app stakes real
  money on outcomes decided by `backend/src/services/gameEngineService.ts`.
  That RNG is an honest, server-side implementation, but it is **not**
  independently certified — real casino licences require certification from
  an accredited testing lab (e.g. GLI, iTech Labs, BMM) before real players
  can use it.
- **Phone auth**: `backend/src/services/smsService.ts` doesn't send real
  SMS in "mock" mode (the OTP is just returned in the API response) until
  you wire a UK SMS provider into it and set `SMS_PROVIDER_MODE=live` —
  mock mode must never be used with real users.

## Architecture

```
backend/   Node.js + TypeScript + Express + PostgreSQL (Prisma) REST API
mobile/    React Native (Expo) app — built first, consumes backend API
web/       (not yet built) — planned to reuse the same backend API once
           the mobile app is stable
```

One backend serves both clients, so business logic (odds, wallet,
responsible-gambling rules, settlement) lives in one place.

## Getting started

See `backend/README.md` and `mobile/README.md` for setup instructions.

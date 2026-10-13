# NovaPlay backend

Node.js + TypeScript + Express + PostgreSQL (Prisma).

## Setup

```bash
cp .env.example .env   # then edit DATABASE_URL / JWT_SECRET
npm install
npm run prisma:migrate  # creates tables
npm run prisma:seed     # creates an admin user + a sample football event
npm run dev              # http://localhost:4000
```

Default seeded admin: `admin@novaplay.test` / `ChangeMe123!` — change the
password immediately in a real environment.

## API overview

| Area | Routes |
|---|---|
| Auth (email) | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Auth (phone/OTP) | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/otp/complete-profile` — see below |
| KYC | `POST /kyc/submit`, `GET /kyc/status` |
| Wallet | `GET /wallet`, `POST /wallet/deposit`, `POST /wallet/withdraw`, `GET /wallet/transactions` |
| Sports | `GET /sports`, `GET /sports/:sportId/events`, `GET /sports/events/:eventId` |
| Bets | `POST /bets`, `GET /bets` |
| Games (real-money) | `GET /games/config`, `POST /games/:gameKey/play`, `GET /games/history`, `GET /games/daily-bonus/status`, `POST /games/daily-bonus/claim` |
| Provably fair | `GET /games/fairness`, `PUT /games/fairness/client-seed`, `POST /games/fairness/rotate`, `GET /games/fairness/history` |
| Responsible gambling | `PUT /responsible-gambling/deposit-limits`, `POST /responsible-gambling/self-exclude` |
| Admin (role=ADMIN) | `/admin/sports`, `/admin/events`, `/admin/markets`, `/admin/selections/:id/odds`, `/admin/markets/:id/settle`, `/admin/users`, `/admin/kyc/:userId`, `/admin/bets`, `/admin/reports/summary` |

All authenticated routes take `Authorization: Bearer <token>` from
`/auth/login`, `/auth/register` or `/auth/otp/verify` /
`/auth/otp/complete-profile`.

### Phone auth via OTP (no Firebase)

The backend owns OTP generation and verification end to end — no
Firebase, no ID tokens. Three steps:

1. `POST /auth/otp/request { phone }` — generates a 6-digit code, stores
   its hash (5 min expiry), and sends it via `src/services/smsService.ts`.
   In `SMS_PROVIDER_MODE=mock` (default) no real SMS is sent; the response
   includes `{ devCode }` so the mobile app can display it for testing —
   never ship that mode to real users. No live SMS gateway is wired in
   yet: `SMS_PROVIDER_MODE=live` makes every OTP request fail until a UK
   provider is added to `smsService.ts`.
2. `POST /auth/otp/verify { phone, code }` — checks the code (max 5
   attempts, then a new code is required). An existing phone number logs
   straight in. A brand-new one gets `428 {"error":"profile_required"}`
   and stays in a "verified" state for 10 minutes.
3. `POST /auth/otp/complete-profile { phone, firstName, lastName, dateOfBirth, country }`
   — only for new numbers, only within that 10-minute window (no need to
   re-enter the code). Creates the account, enforcing 18+ server-side.

### Games (`POST /games/:gameKey/play`)

Body: `{ stake, gameType: "coinflip" | "dice", target? }` (`target`, 2-98,
only applies to `dice` — the roll-under number the player picked; its
payout multiplier is always `rtp * 100 / target` so every target has the
same expected value). Outcomes are computed via
`src/services/fairnessService.ts` + `src/utils/rng.ts`: a secret
per-user server seed (committed via its SHA-256 hash, exposed through
`GET /games/fairness`) combined with a client seed and an incrementing
nonce through HMAC-SHA256. Rotating the seed (`POST
/games/fairness/rotate`) reveals the old one so every round played under
its hash can be recomputed and verified independently. This proves the
*process* wasn't tampered with — it is not the same as accredited RNG
certification, which a real licence still requires.

## Deploying to Vercel

This backend runs as a Vercel serverless function: `api/index.ts` exports
the Express app from `src/app.ts` (unchanged from local dev — only
`src/index.ts`'s `app.listen()` is skipped in serverless mode), and
`vercel.json` rewrites every request path to that one function.
`vercel.json`'s `buildCommand` is a no-op — without it, Vercel runs this
package's own `build` script (`tsc`, meant for traditional hosting).
Either way, having a `build` script in package.json at all makes Vercel
require a static output directory, so `public/index.html` is a trivial
placeholder (never actually served — the catch-all rewrite sends every
path to the API function first) just to satisfy that check.

1. In the Vercel project's **Settings → Build and Deployment → Root
   Directory**, set it to `backend` (this repo has multiple apps at the
   root — Vercel's own docs say "General" but it actually lives under
   "Build and Deployment").
2. In **Storage**, create a Postgres database and connect it to the
   project — this sets `DATABASE_URL` (or an equivalent env var; if it's
   named differently, e.g. `POSTGRES_PRISMA_URL`, add a `DATABASE_URL` env
   var pointing to the same pooled connection string so Prisma finds it).
3. Set `JWT_SECRET` (any long random string) as an env var — required at
   runtime; the deploy will build fine without it but every request will
   500 until it's set.
4. After the first successful deploy, run `npm run prisma:deploy` (applies
   migrations) and optionally `npm run prisma:seed` against that same
   `DATABASE_URL` from your local machine or a one-off script.
   (Note: use the Vercel dashboard's Deployments list to redeploy the
   specific deployment tied to this branch — the Environment Variables
   page's generic "Redeploy" banner can redeploy whatever deployment is
   currently pinned as Production, even one from a different branch.)
5. Point the mobile app's `API_BASE_URL` (`mobile/src/api/client.ts`) at
   the deployment's URL instead of `localhost`.

## KYC, payments & SMS are mocked

`src/services/kycService.ts`, `src/services/paymentService.ts` and
`src/services/smsService.ts` each export an interface plus a `Mock*`/dev
implementation used by default
(`KYC_PROVIDER_MODE`/`PAYMENT_PROVIDER_MODE`/`SMS_PROVIDER_MODE=mock`). No
real money, real identity data, or real SMS ever moves through these.
Before accepting real users, implement `LiveKycProvider` /
`LivePaymentProvider` against a licensed KYC vendor and a
gambling-licensed payment processor, add a UK SMS provider, then flip
the mode env vars to `live`. See the root `README.md` for the full
compliance checklist, including the RNG certification requirement for
`/games/:gameKey/play`.

# NovaPlay — Mobile App

A real-money gaming mobile app built with Expo (React Native + TypeScript). Coins are backed 1:1
by real money — see the root `README.md` for the compliance checklist (licence verification, KYC,
payment provider) before this goes anywhere near real users.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on your Android/iOS phone, or press `a` / `i` to
open an Android/iOS emulator, or `w` for a web preview.

You'll also need the `backend` API running (see `../backend/README.md`) — this app calls it for
everything money-related. Edit `API_BASE_URL` in `src/api/client.ts` to point at it (use your
machine's LAN IP for a physical device or Android emulator, not `localhost`).

## What's included

- **Login/Register** — phone number + OTP, entirely backend-owned (no Firebase — see "Auth"
  below). New numbers go through `CompleteProfileScreen` to collect name/DOB/country, enforcing
  the 18+ requirement server-side before an account exists.
- **Home** — hero banner, quick filters, game categories, featured carousel, filtered game grid.
- **Wallet** — real balance from the backend, deposit/withdraw (sandbox payment provider by
  default), transaction history.
- **Game Detail** — "Play for Real" stakes Coins on a backend-settled round; the backend's
  server-side RNG decides win/loss (see `backend/src/services/gameEngineService.ts` — **not**
  independently certified, see root README).
- **Dice** (Home → "Dice" button) — pick a roll-under target (2-98) and see the win chance/payout
  multiplier update live before staking; a genuinely different risk/reward mechanic from the
  arcade games' fixed coin-flip. Every round is "provably fair" — see Settings.
- **Rewards** — daily streak bonus (server-tracked, real money, fixed reward table shared with the
  backend). Missions and VIP bonuses are still cosmetic/local-only — they don't move real money
  yet (see the comment at the top of `GameStateContext.tsx`).
- **Settings** — KYC submission, daily deposit limit, 30-day self-exclusion (all backend-enforced),
  and a Provably Fair section showing your active seed hash/client seed with a rotate-and-verify
  button.
- **Ranking**, **VIP**, **Profile**, **Help Center**, **Notifications**, **Game Category browser**.

## Auth: phone number + OTP (no Firebase)

`src/state/AuthContext.tsx` calls the backend directly — no Firebase SDK, no ID tokens. The
backend generates the 6-digit code, hashes and stores it, and sends it via
`backend/src/services/smsService.ts` (mock in dev — shows the code on-screen since no real SMS is
sent; no live SMS gateway is wired in yet — a UK provider must be added before live mode). The backend is what actually creates the
account, issues the session JWT, and is the only thing that can create a wallet.

## Project structure

```
src/
  api/           backend HTTP client + typed endpoint calls (src/api/backend.ts)
  theme/         design tokens (colors, gradients, spacing, typography)
  data/          TypeScript models + mock data (game catalog, categories — not money)
  services/      wallet/game service layer — now backed by the real API, not local mocks
  state/         AuthContext (backend session) + GameStateContext (wallet, missions, favorites)
  components/    reusable UI building blocks
  navigation/    bottom tabs + root stack
  screens/       one file per screen
```

## Coins are real money now

Nothing in this app should ever credit the wallet on the client — every path that adds or removes
Coins (deposit, withdraw, game stake/payout, daily bonus) goes through a backend endpoint that
enforces KYC status, self-exclusion and deposit limits. Missions and VIP bonuses are deliberately
*not* wired to the wallet yet, because their "progress" isn't server-verified — see the comment in
`GameStateContext.tsx` before enabling real payouts there.

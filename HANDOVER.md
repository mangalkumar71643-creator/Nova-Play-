# NovaPlay — handover notes for a developer

A short map of what exists, where it lives and how to run, build and deploy
it. Read `README.md` too: its legal and compliance section applies before
any real customer uses the product.

## 1. What is in the repo

```
backend/     Server: Node.js + TypeScript + Express + Prisma (PostgreSQL)
  prisma/schema.prisma   All database tables
  prisma/seed.ts         Runs on every deploy: default admin (only if none),
                         seed popup, and the "unplayed money" database trigger
  src/app.ts             Express app; every route is mounted here
  src/routes/            One file per area (games, wallet, admin, …)
  src/services/          Logic behind the routes (one service per game, etc.)
  src/config/env.ts      Every environment variable the server reads
  public/admin.html      The whole admin panel (single page, plain JS)
mobile/      App: React Native (Expo SDK 57)
  src/screens/           One screen per game + Home, Wallet, VIP, Ranking, …
  src/components/        Shared UI (HomeSlider, HomePopups, GameTile, …)
  src/api/backend.ts     Every call the app makes to the server
  src/navigation/        Screen list and bottom tabs
  android/               Native Android project (APK build)
admin-app/   Small Android app that opens the admin panel in a WebView
```

## 2. Live services

| What | Where |
| --- | --- |
| Server + admin panel | Vercel, team `mangak`, project `novaplay-server` → `https://novaplay-server.vercel.app` (admin: `/admin.html`) |
| Database | PostgreSQL; the connection string is the `DATABASE_URL` environment variable on the Vercel project |
| Code | GitHub `mangalkumar71643-creator/10s2`, branch `claude/betting-app-dev-0r7vsq` |

Vercel builds every push to the branch as a preview; production is promoted
from a preview. The build command (in `backend/vercel.json`) runs
`prisma db push` and `prisma/seed.ts` — note this means **preview builds
also change the production database schema**.

## 3. Environment variables (server)

Set on the Vercel project (Settings → Environment Variables). Never commit
real values. The full list with defaults is in `backend/src/config/env.ts`;
`backend/.env.example` has the basics.

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — signs login tokens; anyone holding it can forge logins
- `DEPOSITS_ENABLED` — deposits are refused unless this is `"true"`
- `GAME_MAX_PAYOUT`, house-edge and bonus settings — see `env.ts`
- `TEEN_PATTI_CLUB_RAKE` — the house's share of each Teen Patti Club pot (default `0.05`; the game never takes less than 5%, whatever is set)
- `KYC_PROVIDER_MODE`, `PAYMENT_PROVIDER_MODE`, `SMS_PROVIDER_MODE` — all `mock` today

## 4. Running locally

Server:

```
cd backend
npm install
# create backend/.env from .env.example with your own DATABASE_URL and JWT_SECRET
npx prisma db push
npx tsx prisma/seed.ts
npm run dev            # http://localhost:4000, health check at /health
```

App (talks to the live server; the address is `API_BASE_URL` in `mobile/src/api/client.ts`):

```
cd mobile
npm install
npx expo start         # or: npx expo start --web
```

## 5. Building the Android APK

```
cd mobile/android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=true \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=true
# output: mobile/android/app/build/outputs/apk/release/app-release.apk
```

The release build is signed with the debug keystore. Before any store
release, create a real upload keystore and keep it safe — losing it means
users can't update the app.

Admin app: `cd admin-app && ./gradlew assembleRelease`.

**Keeping the app small** (about 30 MB): the pictures are WEBP at quality 80 at most (`mobile/scripts/art/to_webp.py` caps what the art
builder writes; `python3 mobile/scripts/art/shrink_webp.py` does the same for pictures already in `mobile/assets`). The fonts are small
subsets: `pip install fonttools`, then `python3 mobile/scripts/fonts/subset.py` makes the five Montserrat fonts (Latin only, full ones are in
`mobile/scripts/fonts/full`) and `assets/fonts/MaterialCommunityIcons.subset.ttf` (only the icons the app names; `mobile/metro.config.js`
makes the app load it instead of the 1.3 MB full font). **After adding an icon, run `subset.py` again** and
`python3 mobile/scripts/fonts/check_icons.py` (it fails if an icon or a symbol the app uses is missing).

## 6. Main features and where they live

| Feature | Server | App | Admin panel |
| --- | --- | --- | --- |
| Login (phone OTP for players, email/password for admin) | `routes/auth.routes.ts`, `services/authService.ts`, `services/otpService.ts` | `screens/LoginScreen.tsx`, `OtpScreen.tsx` | Settings → Change login |
| Wallet, withdrawals, history, balance records | `routes/wallet.routes.ts`, `services/paymentService.ts` | `screens/WalletScreen.tsx`, `DepositScreen.tsx`, `WithdrawScreen.tsx`, `HistoryScreen.tsx`, `BalanceRecordsScreen.tsx` | Transactions (withdrawal approval) |
| Winnings-only withdrawals | `Wallet.unplayedDeposit` + trigger in `prisma/seed.ts` | — | — |
| Games (about 40, each its own service) | `services/*Service.ts`, `routes/*.routes.ts` | `screens/*Screen.tsx`, tiles in `components/GameTile.tsx` | Games, Reports |
| Teen Patti Club: real Teen Patti for 2-5 players (Quick Play boots, or a player's own boot and size; open or friends-only tables), the house keeps a rake of at least 5% of every pot | `services/teenPattiClubEngine.ts` (the rules), `teenPattiClubService.ts` (tables, wallets, clocks), `routes/teenPattiClub.routes.ts`; check: `scripts/check-teen-patti-club.ts` | `screens/TeenPattiClubScreen.tsx`, `screens/club/*`, `components/club/*` | Reports → Games |
| Ring Gauntlet: climb the segments of a ring (outer 8, middle 6, inner 4), cash out or part cash out any time, autoplay; every segment of every ring returns exactly 90% | `services/ringGauntletEngine.ts` (the odds), `ringGauntletService.ts`, `routes/ringGauntlet.routes.ts`; check: `scripts/check-ring-gauntlet.ts` | `screens/RingGauntletScreen.tsx`, `screens/ring/*` | Reports → Games |
| Turbo Sevens: one-payline 777 slot with a fourth bonus reel (x2/x5/x10, $+ and $$+ cash, respin wheel), exact return 90% | `services/turboSevensEngine.ts` (reels, paytable, exact stats), `turboSevensService.ts`, `routes/turboSevens.routes.ts`; check: `scripts/check-turbo-sevens.ts` | `screens/TurboSevensScreen.tsx`, `screens/turbo/*` | Reports → Games |
| Garuda Gold: 3-reel, five-line temple slot with a fourth MULTIPLIER REEL (1x-100x; a NUDGE coin takes a winning spin to 10x-500x) and an EX bet (1.5 stakes: no 1x, more and richer nudges), exact return 90% in both modes; one spin pays at most ₹5,00,000 (`GARUDA_MAX_PAYOUT`, owner's request) | `services/garudaGoldEngine.ts` (reels, paytable, multiplier reels, nudge tables, exact stats), `garudaGoldService.ts`, `routes/garudaGold.routes.ts`; check: `scripts/check-garuda-gold.ts` | `screens/GarudaGoldScreen.tsx`, `screens/garuda/*`; art `scripts/art/garuda/` | Reports → Games |
| Max win per bet | `services/settingsService.ts` | shown in game screens | Reports → Max win per bet |
| App-open popups and Home slider (with buttons: a popup's PLAY button and its picture open its game; "Download app" popups go to the website only, `?web=1`) | `services/popupService.ts`, `routes/popups.routes.ts` | `components/HomePopups.tsx`, `components/HomeSlider.tsx`, `components/PromoButton.tsx` | Popups, Home Slider |
| Gift codes | `services/giftCodeService.ts` | `screens/GiftCodeScreen.tsx` | Gift Codes |
| VIP levels and bonuses, Ranking | `services/vipService.ts`, `services/rankingService.ts` | `screens/VipScreen.tsx`, `RankingScreen.tsx` | — |
| Test balance by UID | `routes/admin.routes.ts` | — | Users → Add test balance |
| Responsible gambling (limits, self-exclusion) | `services/responsibleGamblingService.ts` | Settings | — |

## 7. Things that are placeholders today

- **KYC** — `services/kycService.ts` uses a mock provider.
- **SMS/OTP** — `services/smsService.ts` in mock mode returns the OTP in the API response; no live SMS gateway is wired in (Fast2SMS was removed) — a UK provider must be added before live mode. Never use mock mode with real users.
- **Payments** — `services/paymentService.ts` has only a mock provider, and deposits are switched off (`DEPOSITS_ENABLED`).
- **Game RNG** — honest and server-side, but not certified by a testing lab.
- **Geo-restriction** — not implemented.

Each of these needs a licensed provider (and, for the RNG, lab
certification) chosen for the jurisdiction the product is licensed in.

## 8. Admin login

The admin account lives in the database (table `User`, role `ADMIN`). It can
be changed from the admin panel (Settings → Change login). The seed only
creates a default admin when none exists.

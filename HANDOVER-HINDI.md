# NovaPlay — developer ko dene wala note (Hindi)

Is note me likha hai ki app me kya bana hai, kaun sa code kahan hai, aur
app kaise chalta, banta aur server pe jata hai. Developer ke liye isi ka
English version `HANDOVER.md` me hai. `README.md` bhi padhna: usme kanoon
aur license ki zaroori baatein likhi hain, jo asli players aane se pehle
poori honi chahiye.

## 1. Code me kya-kya hai

Code ke teen hisse hain:

- **`backend/`** — server aur admin panel
  - `prisma/schema.prisma`: database ki saari tables
  - `prisma/seed.ts`: har deploy pe chalta hai. Admin na ho to default admin banata hai, ek popup daalta hai, aur "bina khela paisa" ginne wala niyam database me lagata hai
  - `src/app.ts`: server ka main file, saare raaste (routes) yahin jude hain
  - `src/routes/`: har kaam ki alag file (games, wallet, admin, …)
  - `src/services/`: asli logic (har game ki alag file)
  - `src/config/env.ts`: server kaun-kaun si settings padhta hai
  - `public/admin.html`: pura admin panel isi ek file me hai
- **`mobile/`** — app (React Native / Expo)
  - `src/screens/`: har game aur har screen (Home, Wallet, VIP, Ranking, …) ki file
  - `src/components/`: baar-baar use hone wale hisse (Home slider, popup, game tile)
  - `src/api/backend.ts`: app server se jo bhi baat karta hai, sab yahan
  - `android/`: Android ka project, isi se APK banta hai
- **`admin-app/`** — chhota Android app jo admin panel kholta hai

## 2. Kya kahan chal raha hai

| Kya | Kahan |
| --- | --- |
| Server aur admin panel | Vercel, team `mangak`, project `novaplay-server`. Pata: `https://novaplay-server.vercel.app`, admin panel: `/admin.html` |
| Database (players ka saara data) | PostgreSQL. Iska link Vercel ki settings me `DATABASE_URL` naam se hai |
| Code | GitHub: `mangalkumar71643-creator/10s2`, branch `claude/betting-app-dev-0r7vsq` |

Branch pe jo bhi code daalo, Vercel uska ek test version (preview) bana
deta hai. Use phir live (production) kiya jata hai.

**Dhyan rahe:** test version bante waqt bhi live database ka dhaancha badal
jata hai.

## 3. Server ki secret settings

Yeh Vercel me rakhi hain: project kholo, phir Settings, phir Environment
Variables. Inhe kabhi code me, chat me ya WhatsApp pe mat daalna. Saari
settings ki list `backend/src/config/env.ts` me hai.

- `DATABASE_URL`: database ka link
- `JWT_SECRET`: login ki secret. Jiske paas yeh ho, woh kisi ke bhi naam se login kar sakta hai
- `DEPOSITS_ENABLED`: jab tak yeh `"true"` na ho, deposit band rehta hai
- `GAME_MAX_PAYOUT`, house edge aur bonus ki settings: `env.ts` me dekho
- `KYC_PROVIDER_MODE`, `PAYMENT_PROVIDER_MODE`, `SMS_PROVIDER_MODE`: teeno abhi `mock` (nakli) hain

## 4. Apne computer pe chalana (developer ke liye)

Server:

```
cd backend
npm install
# .env.example se backend/.env banao, apna DATABASE_URL aur JWT_SECRET daalo
npx prisma db push
npx tsx prisma/seed.ts
npm run dev            # http://localhost:4000, jaanch ke liye /health
```

App (yeh live server se baat karta hai; server ka pata
`mobile/src/api/client.ts` me `API_BASE_URL` hai):

```
cd mobile
npm install
npx expo start         # ya: npx expo start --web
```

## 5. APK banana (developer ke liye)

```
cd mobile/android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=true \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=true
# APK yahan banega: mobile/android/app/build/outputs/apk/release/app-release.apk
```

Abhi APK test wali key (debug keystore) se sign hota hai. Play Store pe
daalne se pehle apni asli signing key banao aur use sambhal ke rakho. Yeh
key kho gayi to app ka update nahi daal paoge.

Admin app: `cd admin-app && ./gradlew assembleRelease`.

## 6. Har feature ka code kahan hai

| Feature | Server | App | Admin panel |
| --- | --- | --- | --- |
| Login (player: phone OTP, admin: email/password) | `routes/auth.routes.ts`, `services/authService.ts`, `services/otpService.ts` | `screens/LoginScreen.tsx`, `OtpScreen.tsx` | Settings, phir Change login |
| Wallet, withdraw, history, balance records | `routes/wallet.routes.ts`, `services/paymentService.ts` | `screens/WalletScreen.tsx`, `DepositScreen.tsx`, `WithdrawScreen.tsx`, `HistoryScreen.tsx`, `BalanceRecordsScreen.tsx` | Transactions (withdraw ki manzoori) |
| Sirf jeeta hua paisa withdraw ho | `Wallet.unplayedDeposit` aur `prisma/seed.ts` ka niyam | — | — |
| Games (lagbhag 40, har game ki alag file) | `services/*Service.ts`, `routes/*.routes.ts` | `screens/*Screen.tsx`, tile: `components/GameTile.tsx` | Games, Reports |
| Ek bet pe sabse zyada jeet (max win) | `services/settingsService.ts` | game screens me dikhta hai | Reports, phir Max win per bet |
| App khulne ke popup aur Home slider (button ke saath) | `services/popupService.ts`, `routes/popups.routes.ts` | `components/HomePopups.tsx`, `components/HomeSlider.tsx` | Popups, Home Slider |
| Gift code | `services/giftCodeService.ts` | `screens/GiftCodeScreen.tsx` | Gift Codes |
| VIP level aur bonus, Ranking | `services/vipService.ts`, `services/rankingService.ts` | `screens/VipScreen.tsx`, `RankingScreen.tsx` | — |
| UID se test balance jodna | `routes/admin.routes.ts` | — | Users, phir Add test balance |
| Khelne ki seema (limit, khud ko block karna) | `services/responsibleGamblingService.ts` | Settings | — |

## 7. Abhi kya nakli (mock) hai

- **KYC (pehchaan ki jaanch):** `services/kycService.ts` me nakli provider hai.
- **SMS/OTP:** `services/smsService.ts` nakli mode me OTP bhejta nahi, seedha jawab me de deta hai. Asli SMS ki koi company abhi judi nahi hai (Fast2SMS hata diya gaya); UK ki SMS company jodni hogi. Asli players ke saath nakli mode kabhi mat chalana.
- **Payment:** `services/paymentService.ts` me sirf nakli provider hai, aur deposit band hai (`DEPOSITS_ENABLED`). Asli payment gateway jodne ka koi code taiyar nahi hai. Woh poora kaam developer ko likhna hoga.
- **Game ka random number system (RNG):** imaandaar hai aur server pe chalta hai, par kisi testing lab ka certificate nahi hai.
- **Desh ke hisaab se rok (geo-restriction):** bana hi nahi hai.

In sab ke liye us desh ki licensed company chahiye jahan app ka license
hai. RNG ke liye lab ka certificate bhi chahiye.

## 8. Admin login

Admin ka account database me hai (`User` table, role `ADMIN`). Use admin
panel se badal sakte ho: Settings, phir Change login. Seed sirf tab
default admin banata hai jab koi admin na ho.

## 9. Sirf phone ho to aap kya kar sakte ho

- **Code dekhna:** GitHub app, ya Chrome me github.com.
- **Developer ko GitHub ka access dena:**
  1. Chrome me repo kholo.
  2. Menu me "Desktop site" on karo.
  3. Repo ki Settings me jao, phir Collaborators.
  4. "Add people" dabao aur developer ka GitHub username daalo.
- **Developer ko Vercel ka access dena:**
  1. Chrome me vercel.com kholo, Desktop site on karke.
  2. Team "mangak" kholo, phir Settings, phir Members.
  3. Developer ka email daalke invite karo.
- **Code badalna, APK banana, server chalana:** yeh phone se nahi hota, developer apne computer pe karega.
- **Password kabhi share mat karna.** Hamesha upar wale tareeke se access do. Kaam khatam hone pe access hata do.

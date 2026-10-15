# StockPay Payment — Live Test Checklist (Hindi)

Yeh checklist tab chalani hai jab `STOCKPAY-SETUP-HINDI.md` ke saare steps
ho jayein (Vercel me 3 env vars + redeploy + StockPay me webhook URL).

## 0. Redeploy hua ya nahi — pehle ye check

Browser me kholo (ya mujhe bolo, main curl se check kar dunga):

- `https://novaplay-server.vercel.app/health` → `{"status":"ok"}` aana chahiye
- `https://novaplay-server.vercel.app/wallet/upi/status` → **404 nahi**
  aana chahiye (401/error JSON theek hai — 404 ka matlab purana code abhi
  bhi live hai, redeploy dobara karo)

## 1. Order banana (app se)

1. App me `98XXXXXXXX` (aapka number) wale account se login karo.
2. Deposit screen pe neeche "Pay by UPI with StockPay · TEST MODE" dikhna
   chahiye. Agar "not in STOCKPAY_TEST_PHONES" aaye to Vercel me number
   check karo aur redeploy karo.
3. ₹100 daalke **Pay Now** dabao → StockPay ka payment page khulna chahiye.

## 2. Payment simulate karke credit check

1. Payment page pe **"Simulate successful payment"** dabao.
2. App me wapas aao → kuch second me **"Deposit Successful!"** wali
   celebration screen aani chahiye (+₹100, pehli deposit hai to bonus ke
   saath) aur Cash balance badhna chahiye.
3. Wallet → history me is deposit ka label **"UPI Deposit"** aur UPI wala
   icon dikhna chahiye.
4. Admin panel → Transactions → **StockPay UPI deposits** me yeh row
   **COMPLETED** dikhni chahiye.

## 3. Duplicate credit nahi hona chahiye

- Deposit screen dubara kholo — wahi payment dobara credit NAHI hona
  chahiye (balance sirf ek baar badha tha).

## 4. Cancel/expire ka case

1. Naya checkout kholo (₹200) par payment page pe **cancel** kar do.
2. App me wapas aao → "Payment cancelled" aana chahiye, balance same
   rahna chahiye.
3. Admin panel me woh row **FAILED** dikhni chahiye.

## 5. Stuck payment ka case

- Agar koi deposit 30 minute se zyada PENDING rahe (player ne page band
  kar diya), admin panel me uske saamne red **STUCK >30m** badge dikhna
  chahiye.

## Agar koi step fail ho

Mujhe bata dena kaun sa step fail hua aur screen pe kya likha aaya —
main logs/code se root cause nikal dunga.

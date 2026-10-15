# StockPay UPI (INR) — setup ke steps (Hindi)

Yeh note batata hai ki StockPay ka TEST-MODE payment kaise chalu karna hai.
Code taiyar hai; sirf server ki settings (Vercel) aur StockPay admin me
webhook register karna baaki hai.

## 1. StockPay admin se teen cheezein lo

StockPay ke admin panel kholo (jahan se aapko API mili hai):

1. **Test API key** — API Keys section se. `sk_test_...` se shuru hoti hai.
   (Live key mat daalna — server use jaan boojh ke reject karta hai.)
2. **Webhook secret** — API Keys / Webhooks section se.
3. Test mode me deposit karne wale phone numbers — abhi ke liye
   aapka apna number (jo app me login karta hai).

## 2. Vercel me settings daalo (ye kaam aapko karna hai)

1. Chrome me vercel.com kholo → team `mangak` → project `novaplay-server`.
2. **Settings → Environment Variables** me yeh teen add karo:

| Name | Value |
| --- | --- |
| `STOCKPAY_KEY` | `sk_test_...` (aapki test key) |
| `STOCKPAY_WEBHOOK_SECRET` | webhook secret |
| `STOCKPAY_TEST_PHONES` | `98XXXXXXXX` (aapka number) |

3. Inhe kabhi code me, chat me ya WhatsApp pe mat daalna.

## 3. Server redeploy karo (ye kaam aapko karna hai)

Naya code tab tak live nahi hota jab tak redeploy na ho:

- Naya code GitHub branch `claude/betting-app-dev-0r7vsq` pe push karo
  (Vercel apne aap naya deployment bana dega), ya
- Vercel dashboard → Deployments → pichle deployment ke menu se
  **Redeploy** dabao.

Redeploy ke baad check karo: `https://novaplay-server.vercel.app/health`
khulne pe `{"status":"ok"}` dikhna chahiye.

## 4. StockPay me webhook URL register karo (ye kaam aapko karna hai)

StockPay admin → Webhooks me yeh URL daalo:

```
https://novaplay-server.vercel.app/webhooks/stockpay
```

Aur wahan diya hua webhook secret hi upar `STOCKPAY_WEBHOOK_SECRET` me
daalna hai. Webhook ke bina payment tabhi credit hoga jab player app me
wapas aake Deposit screen khole — webhook se payment turant credit hota
hai, chahe app band hi kyu na ho.

## 5. Test kaise karein

1. App me us account se login karo jiska number `98XXXXXXXX` (aapka number) hai.
2. Deposit screen kholo — neeche "Pay by UPI with StockPay · TEST MODE"
   likha aana chahiye.
3. Amount daalo (₹100 se ₹99,999 tak) → **Pay Now**.
4. StockPay ka payment page khulega — wahan **"Simulate successful
   payment"** dabao (test mode me asli paisa nahi lagta).
5. App me wapas aao — kuch hi second me "Deposit successful" dikhna
   chahiye aur balance badh jana chahiye.
6. Admin panel → Transactions → **StockPay UPI deposits** me yeh deposit
   COMPLETED dikhegi.

## Agar kuch na chale

- Deposit screen pe "UPI payments are not set up yet" → `STOCKPAY_KEY`
  Vercel me nahi pahunchi (redeploy ke baad bhi) ya galat hai.
- "...is not in STOCKPAY_TEST_PHONES" → us account ka number list me nahi
  hai; Vercel me number add karke redeploy karo.
- Payment karne ke baad bhi PENDING → webhook URL register nahi hui ya
  secret galat hai. App me Deposit screen dubara kholne se server StockPay
  se status dubara poochh kar settle kar deta hai.

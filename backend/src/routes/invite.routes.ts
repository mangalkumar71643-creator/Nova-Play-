import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AGENT } from "../services/agentService";
import { getAppDownloadUrl } from "../services/settingsService";

const router = Router();

// Game tiles shown on the page (public/invite/, copied from the app's icons).
const HOT_GAMES = [
  ["aviator", "Aviator"],
  ["wingo", "Win Go"],
  ["chicken-road", "Chicken Road"],
  ["mines", "Mines"],
  ["teen-patti", "Teen Patti"],
  ["dragon-tiger", "Dragon Tiger"],
  ["money-coming", "Money Coming"],
  ["royal-gems", "Royal Gems"],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The page an invite link opens: a big Download button pinned to the bottom
 * (the admin's app download link, Home Slider page), the inviter's code to
 * copy, the three steps to the welcome reward and a few of the games.
 */
router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const code = /^\d{1,12}$/.test(req.params.code) ? req.params.code : "";
    const raw = await getAppDownloadUrl();
    const download = raw && /^https?:\/\//i.test(raw) ? esc(raw) : null;
    const { inviteeReward, minDeposit, wagerMultiple } = AGENT.join;
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Join NovaPlay</title>
<style>
  *{box-sizing:border-box}html,body{margin:0}
  body{min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;background:#140306;display:flex;justify-content:center}
  .wrap{width:100%;max-width:460px;padding:0 0 110px;background:radial-gradient(130% 55% at 50% 0%,#8a1a2c 0%,#3a0913 55%,#140306 100%)}
  header{display:flex;align-items:center;gap:10px;padding:14px 16px;background:rgba(0,0,0,.25);border-bottom:1px solid rgba(255,222,140,.15)}
  header img{width:38px;height:38px}header b{font-size:20px;color:#ffde8c;letter-spacing:.5px}
  .hero{margin:16px;padding:22px 16px 18px;border-radius:20px;text-align:center;background:linear-gradient(160deg,#6a1424,#2a060d);border:1px solid rgba(255,222,140,.35);position:relative;overflow:hidden}
  .hero .t1{color:#e9cdd2;font-size:15px}
  .hero .t2{font-size:34px;font-weight:900;margin:6px 0 2px;background:linear-gradient(#fff3c4,#f0b93d);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 22px rgba(255,184,61,.25)}
  .hero .t3{color:#f0d79a;font-size:14px}
  .hero .tiles{display:flex;justify-content:center;gap:10px;margin-top:16px}
  .hero .tiles img{width:84px;height:84px;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.5)}
  .hero .tiles img:nth-child(2){transform:translateY(-8px) scale(1.08)}
  .steps{margin:0 16px;padding:14px 12px 12px;border-radius:16px;background:rgba(0,0,0,.3);border:1px solid rgba(255,222,140,.15)}
  .bar{position:relative;height:6px;margin:6px 12px 10px;border-radius:3px;background:#2a0a10}
  .bar i{position:absolute;left:0;top:0;bottom:0;width:8%;border-radius:3px;background:linear-gradient(90deg,#ff3b4e,#c4172c)}
  .dots{display:flex;justify-content:space-between;margin:-18px 4px 0}
  .dots span{width:16px;height:16px;border-radius:50%;background:#7a1022;border:2px solid #3a0913;box-shadow:0 0 0 1px rgba(255,222,140,.4)}
  .dots span:first-child{background:#f0b93d}
  .labels{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#e9cdd2;text-align:center}
  .labels div{width:33%}
  .card{margin:16px;padding:18px 16px;border-radius:18px;text-align:center;background:linear-gradient(160deg,#5e1020,#24050b);border:1.5px solid rgba(255,222,140,.5)}
  .label{color:#f0b93d;font-size:12px;font-weight:800;letter-spacing:2px}
  .code{font-size:38px;font-weight:900;letter-spacing:4px;margin:6px 0 12px;color:#fff3c4}
  .copy{display:block;width:100%;border-radius:999px;padding:12px;font-size:16px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.08);color:#ffde8c;border:1px solid rgba(255,222,140,.5)}
  ol{text-align:left;color:#e9cdd2;line-height:1.6;padding-left:20px;margin:16px 0 0;font-size:14px}
  b.g{color:#ffde8c}
  h2{margin:22px 16px 10px;text-align:center;font-size:17px;color:#ffde8c}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 16px}
  .grid div{text-align:center;font-size:11px;color:#e9cdd2}
  .grid img{width:100%;aspect-ratio:1;border-radius:12px;display:block;margin-bottom:4px;box-shadow:0 4px 12px rgba(0,0,0,.45)}
  .muted{color:#9c7f84;font-size:12px;margin:18px 16px 0;text-align:center}
  .dlbar{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(transparent,#140306 35%)}
  .dl{display:block;width:100%;max-width:428px;text-align:center;text-decoration:none;border-radius:999px;padding:16px;font-size:19px;font-weight:900;color:#fff;letter-spacing:.5px;
      background:linear-gradient(#ff5468,#e0213a 55%,#a30f25);box-shadow:0 6px 22px rgba(224,33,58,.55),inset 0 1px 0 rgba(255,255,255,.35)}
  .dl small{display:block;font-size:11px;font-weight:600;opacity:.85;margin-top:2px}
  .dl.off{background:#4a2a30;box-shadow:none;color:#c9a9ae}
</style></head><body><div class="wrap">
<header><img src="/invite/novaplay-badge.webp" alt=""><b>NovaPlay</b></header>
<div class="hero">
  <div class="t1">Your friend invited you to play</div>
  <div class="t2">Get ₹${inviteeReward} reward</div>
  <div class="t3">Download, sign up with the code below and play</div>
  <div class="tiles"><img src="/invite/chicken-road.webp" alt=""><img src="/invite/aviator.webp" alt=""><img src="/invite/wingo.webp" alt=""></div>
</div>
<div class="steps">
  <div class="bar"><i></i></div>
  <div class="dots"><span></span><span></span><span></span></div>
  <div class="labels"><div>Download<br>the app</div><div>Sign up with<br>code ${code || "—"}</div><div>Get ₹${inviteeReward}<br>reward</div></div>
</div>
<div class="card">
  <div class="label">INVITE CODE</div>
  <div class="code">${code || "—"}</div>
  <button class="copy" onclick="var b=this;navigator.clipboard&&navigator.clipboard.writeText('${code}').then(function(){b.textContent='Copied ✓'})">Copy code</button>
  <ol>
    <li>Download NovaPlay and sign up with your phone number.</li>
    <li>On the login screen tap <b>Have an invite code?</b> and enter <b class="g">${code || "—"}</b>, then sign in with your number.</li>
    <li>Deposit <b class="g">₹${minDeposit}</b> and play <b class="g">₹${minDeposit * wagerMultiple}</b> in games — you get <b class="g">₹${inviteeReward}</b> as a welcome reward.</li>
  </ol>
</div>
<h2>Play these and many more</h2>
<div class="grid">${HOT_GAMES.map(([f, n]) => `<div><img src="/invite/${f}.webp" alt="">${n}</div>`).join("")}</div>
<div class="muted">18+ only. Play responsibly.</div>
</div>
<div class="dlbar">${
      download
        ? `<a class="dl" href="${download}">Download NovaPlay<small>Android app</small></a>`
        : `<span class="dl off">Download link coming soon</span>`
    }</div>
</body></html>`);
  })
);

export default router;

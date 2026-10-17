import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AGENT } from "../services/agentService";
import { getAppDownloadUrl } from "../services/settingsService";

const router = Router();

/** The page an invite link opens: the inviter's code, and where to get the app. */
router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const code = /^\d{1,12}$/.test(req.params.code) ? req.params.code : "";
    const download = await getAppDownloadUrl();
    const { inviteeReward, minDeposit, wagerMultiple } = AGENT.join;
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Join NovaPlay</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;
  background:radial-gradient(120% 70% at 50% 0%,#8a1a2c 0%,#3a0913 55%,#140306 100%);display:flex;justify-content:center}
  .wrap{width:100%;max-width:440px;padding:32px 20px 40px;text-align:center}
  h1{margin:0;font-size:30px;letter-spacing:.5px;color:#ffde8c;text-shadow:0 0 18px rgba(255,184,61,.55)}
  .sub{color:#e9cdd2;margin:8px 0 26px}
  .card{background:linear-gradient(160deg,#5e1020,#24050b);border:1.5px solid rgba(255,222,140,.6);border-radius:22px;padding:22px 18px}
  .label{color:#f0b93d;font-size:12px;font-weight:800;letter-spacing:2px}
  .code{font-size:40px;font-weight:900;letter-spacing:4px;margin:8px 0 14px;color:#fff3c4}
  button,.btn{display:block;width:100%;border:0;border-radius:999px;padding:14px;font-size:17px;font-weight:900;cursor:pointer;text-decoration:none}
  .copy{background:rgba(255,255,255,.1);color:#ffde8c;border:1px solid rgba(255,222,140,.5)}
  .dl{margin-top:16px;background:linear-gradient(#ffde8c,#f0b93d,#b8862a);color:#3a2006;box-shadow:0 4px 18px rgba(255,184,61,.45)}
  ol{text-align:left;color:#e9cdd2;line-height:1.6;padding-left:20px;margin:22px 0 0}
  b{color:#ffde8c}.muted{color:#9c7f84;font-size:12px;margin-top:18px}
</style></head><body><div class="wrap">
<h1>NovaPlay</h1><div class="sub">Your friend invited you to play</div>
<div class="card">
  <div class="label">INVITE CODE</div>
  <div class="code" id="code">${code || "—"}</div>
  <button class="copy" onclick="navigator.clipboard&&navigator.clipboard.writeText('${code}').then(function(){this.textContent='Copied ✓'}.bind(this))">Copy code</button>
  ${download ? `<a class="btn dl" href="${download.replace(/"/g, "&quot;")}">Download NovaPlay</a>` : ""}
  <ol>
    <li>Install NovaPlay and sign up with your phone number.</li>
    <li>Enter invite code <b>${code}</b> on the profile step.</li>
    <li>Deposit <b>₹${minDeposit}</b> and play <b>₹${minDeposit * wagerMultiple}</b> in games — you get <b>₹${inviteeReward}</b> as a welcome reward.</li>
  </ol>
</div>
<div class="muted">18+ only. Play responsibly.</div>
</div></body></html>`);
  })
);

export default router;

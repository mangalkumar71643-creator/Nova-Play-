import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import kycRoutes from "./routes/kyc.routes";
import walletRoutes from "./routes/wallet.routes";
import gamesRoutes from "./routes/games.routes";
import responsibleGamblingRoutes from "./routes/responsibleGambling.routes";
import adminRoutes from "./routes/admin.routes";
import supportRoutes from "./routes/support.routes";
import aviatorRoutes from "./routes/aviator.routes";
import chickenRoadRoutes from "./routes/chickenRoad.routes";
import minesRoutes from "./routes/mines.routes";
import sevenUpDownRoutes from "./routes/sevenUpDown.routes";
import plinkoRoutes from "./routes/plinko.routes";
import dragonTigerRoutes from "./routes/dragonTiger.routes";
import vortexRoutes from "./routes/vortex.routes";
import andarBaharRoutes from "./routes/andarBahar.routes";
import teenPattiRoutes from "./routes/teenPatti.routes";
import cricketXRoutes from "./routes/cricketX.routes";
import jhandiMundaRoutes from "./routes/jhandiMunda.routes";
import rouletteRoutes from "./routes/roulette.routes";
import k3Routes from "./routes/k3.routes";
import winGoRoutes from "./routes/winGo.routes";
import fiveDRoutes from "./routes/fiveD.routes";
import trxRoutes from "./routes/trx.routes";
import baccaratRoutes from "./routes/baccarat.routes";
import slotRoutes from "./routes/slot.routes";
import acesRoutes from "./routes/aces.routes";
import diceRoutes from "./routes/dice.routes";
import limboRoutes from "./routes/limbo.routes";
import blackjackRoutes from "./routes/blackjack.routes";
import kenoRoutes from "./routes/keno.routes";
import hiloRoutes from "./routes/hilo.routes";
import dragonTowerRoutes from "./routes/dragonTower.routes";
import videoPokerRoutes from "./routes/videoPoker.routes";
import diamondsRoutes from "./routes/diamonds.routes";
import pumpRoutes from "./routes/pump.routes";
import coinFlipRoutes from "./routes/coinFlip.routes";
import casinoHoldemRoutes from "./routes/casinoHoldem.routes";
import threeCardPokerRoutes from "./routes/threeCardPoker.routes";
import candyBlastRoutes from "./routes/candyBlast.routes";
import neon777Routes from "./routes/neon777.routes";
import popupsRoutes from "./routes/popups.routes";
import giftCodesRoutes from "./routes/giftCodes.routes";
import vipRoutes from "./routes/vip.routes";
import rocketRoutes from "./routes/rocket.routes";
import goalRushRoutes from "./routes/goalRush.routes";
import bigCatchRoutes from "./routes/bigCatch.routes";
import cosmonautRoutes from "./routes/cosmonaut.routes";
import skyJetRoutes from "./routes/skyJet.routes";
import nightRacerRoutes from "./routes/nightRacer.routes";
import airshipRoutes from "./routes/airship.routes";
import zeusRoutes from "./routes/zeus.routes";
import wolfMoonRoutes from "./routes/wolfMoon.routes";
import penaltyRoutes from "./routes/penalty.routes";
import cupsRoutes from "./routes/cups.routes";
import bombRoutes from "./routes/bomb.routes";
import vaultRoutes from "./routes/vault.routes";
import treasureRoutes from "./routes/treasure.routes";
import wheelRoutes from "./routes/wheel.routes";
import scratchRoutes from "./routes/scratch.routes";
import diceDuelRoutes from "./routes/diceDuel.routes";
import colorBallRoutes from "./routes/colorBall.routes";
import fortuneSixRoutes from "./routes/fortuneSix.routes";
import fruitMachineRoutes from "./routes/fruitMachine.routes";
import fishermanRoutes from "./routes/fisherman.routes";
import bookOfPharaohRoutes from "./routes/bookOfPharaoh.routes";
import moneyComingRoutes from "./routes/moneyComing.routes";
import { closeOutRetiredGames } from "./services/retiredGamesCloseout";
import { refreshSettingsIfStale } from "./services/settingsService";

export const app = express();

app.use(cors());
// Room for popup images uploaded from the admin panel (base64, already shrunk by the panel).
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Money is kept to the paisa: a stake like 10.005 would be stored rounded
// but paid out / refunded on a different rounding, so reject it up front.
const MONEY_KEYS = new Set(["stake", "amount", "ante", "pairPlus", "maxPayout", "depositLimitDaily", "depositLimitWeekly", "depositLimitMonthly"]);
function hasSubPaisa(value: unknown, key?: string): boolean {
  if (typeof value === "number") return key !== undefined && MONEY_KEYS.has(key) && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6;
  if (Array.isArray(value)) return value.some((v) => hasSubPaisa(v, key));
  if (value && typeof value === "object") return Object.entries(value).some(([k, v]) => hasSubPaisa(v, k));
  return false;
}
app.use((req, res, next) => {
  if (req.body && hasSubPaisa(req.body)) return res.status(400).json({ error: "Amounts can have at most 2 decimal places." });
  next();
});

// Admin-changed settings (e.g. the max win per bet) take effect within seconds on every instance.
app.use((_req, _res, next) => {
  refreshSettingsIfStale().then(() => next(), next);
});

app.use("/auth", authRoutes);
app.use("/kyc", kycRoutes);
app.use("/wallet", walletRoutes);
app.use("/games", gamesRoutes);
app.use("/responsible-gambling", responsibleGamblingRoutes);
app.use("/admin", adminRoutes);
app.use("/support", supportRoutes);
app.use("/aviator", aviatorRoutes);
app.use("/chicken-road", chickenRoadRoutes);
app.use("/mines", minesRoutes);
app.use("/seven-up-down", sevenUpDownRoutes);
app.use("/plinko", plinkoRoutes);
app.use("/dragon-tiger", dragonTigerRoutes);
app.use("/vortex", vortexRoutes);
app.use("/andar-bahar", andarBaharRoutes);
app.use("/teen-patti", teenPattiRoutes);
app.use("/cricket-x", cricketXRoutes);
app.use("/jhandi-munda", jhandiMundaRoutes);
app.use("/roulette", rouletteRoutes);
app.use("/k3", k3Routes);
app.use("/wingo", winGoRoutes);
app.use("/5d", fiveDRoutes);
app.use("/trx", trxRoutes);
app.use("/baccarat", baccaratRoutes);
app.use("/slot", slotRoutes);
app.use("/aces", acesRoutes);
app.use("/dice", diceRoutes);
app.use("/limbo", limboRoutes);
app.use("/blackjack", blackjackRoutes);
app.use("/keno", kenoRoutes);
app.use("/hilo", hiloRoutes);
app.use("/dragon-tower", dragonTowerRoutes);
app.use("/video-poker", videoPokerRoutes);
app.use("/diamonds", diamondsRoutes);
app.use("/pump", pumpRoutes);
app.use("/coinflip", coinFlipRoutes);
app.use("/casino-holdem", casinoHoldemRoutes);
app.use("/three-card-poker", threeCardPokerRoutes);
app.use("/candy-blast", candyBlastRoutes);
app.use("/neon-777", neon777Routes);
app.use("/popups", popupsRoutes);
app.use("/gift-codes", giftCodesRoutes);
app.use("/players", vipRoutes);
app.use("/rocket", rocketRoutes);
app.use("/goal-rush", goalRushRoutes);
app.use("/big-catch", bigCatchRoutes);
app.use("/cosmonaut", cosmonautRoutes);
app.use("/sky-jet", skyJetRoutes);
app.use("/night-racer", nightRacerRoutes);
app.use("/airship", airshipRoutes);
app.use("/gates-of-zeus", zeusRoutes);
app.use("/wolf-moon", wolfMoonRoutes);
app.use("/penalty", penaltyRoutes);
app.use("/lucky-cups", cupsRoutes);
app.use("/bomb-squad", bombRoutes);
app.use("/vault-heist", vaultRoutes);
app.use("/treasure-dig", treasureRoutes);
app.use("/lucky-wheel", wheelRoutes);
app.use("/scratch-card", scratchRoutes);
app.use("/dice-duel", diceDuelRoutes);
app.use("/color-ball", colorBallRoutes);
app.use("/fortune-six", fortuneSixRoutes);
app.use("/fruit-machine", fruitMachineRoutes);
app.use("/fishermans-catch", fishermanRoutes);
app.use("/book-of-pharaoh", bookOfPharaohRoutes);
app.use("/money-coming", moneyComingRoutes);

app.use(errorHandler);

// Retired games (the original Win Go, the sportsbook): settle / refund
// anything still open on them. Idempotent, so every cold start is harmless.
closeOutRetiredGames().catch((err) => console.error("Retired games close-out failed", err));

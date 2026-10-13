import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  cashOutCricketXBet,
  getCricketXConfig,
  getCurrentRoundView,
  getHistory,
  getMyBets,
  getMyCurrentBet,
  getRoundBets,
  getTopBets,
  placeCricketXBet,
} from "../services/cricketXService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getCricketXConfig());
});

router.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json(await getCurrentRoundView());
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getHistory(limit));
  })
);

const betSchema = z.object({
  amount: z.number().positive(),
  autoCashoutAt: z.number().min(1.01).optional(),
});

router.post(
  "/bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount, autoCashoutAt } = betSchema.parse(req.body);
    const bet = await placeCricketXBet(req.user!.userId, amount, autoCashoutAt);
    res.status(201).json(bet);
  })
);

const cashoutSchema = z.object({
  betId: z.string().min(1),
});

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { betId } = cashoutSchema.parse(req.body);
    res.json(await cashOutCricketXBet(req.user!.userId, betId));
  })
);

router.get(
  "/my-current-bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentBet(req.user!.userId));
  })
);

router.get(
  "/my-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyBets(req.user!.userId));
  })
);

router.get(
  "/round-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodNumber = z.string().min(1).parse(req.query.periodNumber);
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    res.json(await getRoundBets(periodNumber, limit));
  })
);

router.get(
  "/top-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json(await getTopBets(limit));
  })
);

export default router;

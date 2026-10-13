import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { SIDES, cashOutCoinFlip, flipCoin, getActiveCoinFlipRound, getCoinFlipConfig, getMyCoinFlipHistory, startCoinFlip } from "../services/coinFlipService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getCoinFlipConfig());
});

const startSchema = z.object({ stake: z.number().positive() });

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = startSchema.parse(req.body);
    res.status(201).json(await startCoinFlip(req.user!.userId, stake));
  })
);

const roundSchema = z.object({ roundId: z.string().min(1) });

const flipSchema = z.object({ roundId: z.string().min(1), side: z.enum(SIDES) });

router.post(
  "/flip",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, side } = flipSchema.parse(req.body);
    res.json(await flipCoin(req.user!.userId, roundId, side));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundSchema.parse(req.body);
    res.json(await cashOutCoinFlip(req.user!.userId, roundId));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ round: await getActiveCoinFlipRound(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyCoinFlipHistory(req.user!.userId, limit));
  })
);

export default router;

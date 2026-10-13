import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { dealVideoPoker, drawVideoPoker, getActiveVideoPokerRound, getMyVideoPokerHistory, getVideoPokerConfig } from "../services/videoPokerService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getVideoPokerConfig());
});

const dealSchema = z.object({ stake: z.number().positive() });

router.post(
  "/deal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = dealSchema.parse(req.body);
    res.status(201).json(await dealVideoPoker(req.user!.userId, stake));
  })
);

const drawSchema = z.object({ roundId: z.string().min(1), held: z.array(z.number().int().min(0).max(4)).max(5) });

router.post(
  "/draw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, held } = drawSchema.parse(req.body);
    res.json(await drawVideoPoker(req.user!.userId, roundId, held));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ round: await getActiveVideoPokerRound(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyVideoPokerHistory(req.user!.userId, limit));
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  advanceChickenRoadStep,
  cashOutChickenRoadRound,
  getChickenRoadConfig,
  getMyChickenRoadHistory,
  getMyCurrentChickenRoadRound,
  startChickenRoadRound,
} from "../services/chickenRoadService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getChickenRoadConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentChickenRoadRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyChickenRoadHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "HARDCORE"]),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, difficulty } = startSchema.parse(req.body);
    const round = await startChickenRoadRound(req.user!.userId, stake, difficulty);
    res.status(201).json(round);
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });

router.post(
  "/advance",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await advanceChickenRoadStep(req.user!.userId, roundId));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutChickenRoadRound(req.user!.userId, roundId));
  })
);

export default router;

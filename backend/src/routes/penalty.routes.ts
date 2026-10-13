import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  kickPenalty,
  cashOutPenalty,
  getPenaltyConfig,
  getMyPenaltyHistory,
  getMyCurrentPenaltyRound,
  startPenaltyRound,
} from "../services/penaltyService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getPenaltyConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentPenaltyRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyPenaltyHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EXPERT"]),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, difficulty } = startSchema.parse(req.body);
    const round = await startPenaltyRound(req.user!.userId, stake, difficulty);
    res.status(201).json(round);
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });
const kickSchema = z.object({ roundId: z.string().min(1), zone: z.number().int().min(0).max(5) });

router.post(
  "/kick",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, zone } = kickSchema.parse(req.body);
    res.json(await kickPenalty(req.user!.userId, roundId, zone));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutPenalty(req.user!.userId, roundId));
  })
);

export default router;

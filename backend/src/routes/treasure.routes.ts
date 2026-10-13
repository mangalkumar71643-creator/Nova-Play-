import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  digMound,
  cashOutTreasure,
  getTreasureConfig,
  getMyTreasureHistory,
  getMyCurrentTreasureRound,
  startTreasureRound,
} from "../services/treasureService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getTreasureConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentTreasureRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyTreasureHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  crabs: z.union([z.literal(3), z.literal(5), z.literal(8)]),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, crabs } = startSchema.parse(req.body);
    const round = await startTreasureRound(req.user!.userId, stake, crabs);
    res.status(201).json(round);
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });
const digSchema = z.object({ roundId: z.string().min(1), mound: z.number().int().min(0).max(15) });

router.post(
  "/dig",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, mound } = digSchema.parse(req.body);
    res.json(await digMound(req.user!.userId, roundId, mound));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutTreasure(req.user!.userId, roundId));
  })
);

export default router;

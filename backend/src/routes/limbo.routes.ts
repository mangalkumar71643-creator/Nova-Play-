import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getLimboConfig, getMyLimboHistory, playLimbo } from "../services/limboService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getLimboConfig());
});

const playSchema = z.object({
  stake: z.number().positive(),
  target: z.number().positive(),
});

router.post(
  "/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, target } = playSchema.parse(req.body);
    res.status(201).json(await playLimbo(req.user!.userId, stake, target));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyLimboHistory(req.user!.userId, limit));
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getMyRedButtonHistory, getRedButtonConfig, playRedButton } from "../services/redButtonService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getRedButtonConfig());
});

const playSchema = z.object({
  stake: z.number().positive(),
  multiplier: z.number().int().positive(),
});

router.post(
  "/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, multiplier } = playSchema.parse(req.body);
    res.status(201).json(await playRedButton(req.user!.userId, stake, multiplier));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyRedButtonHistory(req.user!.userId, limit));
  })
);

export default router;

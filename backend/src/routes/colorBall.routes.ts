import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getColorBallConfig, getMyColorBallHistory, playColorBall } from "../services/colorBallService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getColorBallConfig());
});

const playSchema = z.object({ stake: z.number().positive(), pick: z.enum(["RED", "BLUE", "GREEN", "GOLD"]) });

router.post(
  "/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, pick } = playSchema.parse(req.body);
    res.status(201).json(await playColorBall(req.user!.userId, stake, pick));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyColorBallHistory(req.user!.userId, limit));
  })
);

export default router;

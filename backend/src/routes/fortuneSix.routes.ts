import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getFortuneSixConfig, getMyFortuneSixHistory, playFortuneSix } from "../services/fortuneSixService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getFortuneSixConfig());
});

const playSchema = z.object({ stake: z.number().positive(), picks: z.array(z.number().int()).length(6) });

router.post(
  "/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, picks } = playSchema.parse(req.body);
    res.status(201).json(await playFortuneSix(req.user!.userId, stake, picks));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyFortuneSixHistory(req.user!.userId, limit));
  })
);

export default router;

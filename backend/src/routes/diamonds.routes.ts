import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getDiamondsConfig, getMyDiamondsHistory, playDiamonds } from "../services/diamondsService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getDiamondsConfig());
});

const playSchema = z.object({ stake: z.number().positive() });

router.post(
  "/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = playSchema.parse(req.body);
    res.status(201).json(await playDiamonds(req.user!.userId, stake));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyDiamondsHistory(req.user!.userId, limit));
  })
);

export default router;

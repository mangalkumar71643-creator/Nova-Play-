import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getGarudaGoldConfig, getMyGarudaGoldHistory, spinGarudaGold } from "../services/garudaGoldService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getGarudaGoldConfig());
});

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyGarudaGoldHistory(req.user!.userId, limit));
  })
);

const spinSchema = z.object({ stake: z.number().positive(), ex: z.boolean().optional() });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, ex } = spinSchema.parse(req.body);
    res.status(201).json(await spinGarudaGold(req.user!.userId, stake, ex === true));
  })
);

export default router;

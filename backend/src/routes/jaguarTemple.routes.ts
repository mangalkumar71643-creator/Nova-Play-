import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getJaguarTempleConfig, getMyJaguarTempleHistory, spinJaguarTemple } from "../services/jaguarTempleService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getJaguarTempleConfig());
});

const spinSchema = z.object({ stake: z.number().positive(), buy: z.boolean().optional() });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, buy } = spinSchema.parse(req.body);
    res.status(201).json(await spinJaguarTemple(req.user!.userId, stake, buy === true));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyJaguarTempleHistory(req.user!.userId, limit));
  })
);

export default router;

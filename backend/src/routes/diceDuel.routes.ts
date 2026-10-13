import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getDiceDuelConfig, getMyDiceDuelHistory, playDiceDuel } from "../services/diceDuelService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getDiceDuelConfig());
});

const playSchema = z.object({ stake: z.number().positive(), pick: z.enum(["PLAYER", "HOUSE", "TIE"]) });

router.post(
  "/play",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, pick } = playSchema.parse(req.body);
    res.status(201).json(await playDiceDuel(req.user!.userId, stake, pick));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyDiceDuelHistory(req.user!.userId, limit));
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { RISKS, getKenoConfig, getMyKenoHistory, playKeno } from "../services/kenoService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getKenoConfig());
});

const betSchema = z.object({
  stake: z.number().positive(),
  picks: z.array(z.number().int()).min(1).max(10),
  risk: z.enum(RISKS),
});

router.post(
  "/bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, picks, risk } = betSchema.parse(req.body);
    res.status(201).json(await playKeno(req.user!.userId, stake, picks, risk));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyKenoHistory(req.user!.userId, limit));
  })
);

export default router;

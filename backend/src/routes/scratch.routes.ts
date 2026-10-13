import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { buyScratchTicket, getMyScratchHistory, getScratchConfig } from "../services/scratchService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getScratchConfig());
});

const buySchema = z.object({ stake: z.number().positive() });

router.post(
  "/buy",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = buySchema.parse(req.body);
    res.status(201).json(await buyScratchTicket(req.user!.userId, stake));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyScratchHistory(req.user!.userId, limit));
  })
);

export default router;

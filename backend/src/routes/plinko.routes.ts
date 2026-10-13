import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { MAX_ROWS, MIN_ROWS, RISKS, dropPlinkoBall, getMyPlinkoHistory, getPlinkoConfig } from "../services/plinkoService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getPlinkoConfig());
});

const dropSchema = z.object({
  stake: z.number().positive(),
  rows: z.number().int().min(MIN_ROWS).max(MAX_ROWS),
  risk: z.enum(RISKS),
});

router.post(
  "/drop",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, rows, risk } = dropSchema.parse(req.body);
    res.status(201).json(await dropPlinkoBall(req.user!.userId, stake, rows, risk));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyPlinkoHistory(req.user!.userId, limit));
  })
);

export default router;

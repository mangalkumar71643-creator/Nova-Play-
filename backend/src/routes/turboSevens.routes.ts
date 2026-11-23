import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getMyTurboSevensHistory, getTurboSevensConfig, spinTurboSevens } from "../services/turboSevensService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getTurboSevensConfig());
});

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyTurboSevensHistory(req.user!.userId, limit));
  })
);

const spinSchema = z.object({ stake: z.number().positive() });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = spinSchema.parse(req.body);
    res.status(201).json(await spinTurboSevens(req.user!.userId, stake));
  })
);

export default router;

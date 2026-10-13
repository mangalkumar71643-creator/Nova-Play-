import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getMyAcesHistory, getAcesConfig, spinAces } from "../services/acesService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getAcesConfig());
});

const spinSchema = z.object({ stake: z.number().positive() });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = spinSchema.parse(req.body);
    res.status(201).json(await spinAces(req.user!.userId, stake));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyAcesHistory(req.user!.userId, limit));
  })
);

export default router;

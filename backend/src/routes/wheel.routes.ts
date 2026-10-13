import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getMyWheelHistory, getWheelConfig, spinWheel } from "../services/wheelService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getWheelConfig());
});

const spinSchema = z.object({ stake: z.number().positive(), risk: z.enum(["LOW", "MEDIUM", "HIGH"]) });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, risk } = spinSchema.parse(req.body);
    res.status(201).json(await spinWheel(req.user!.userId, stake, risk));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyWheelHistory(req.user!.userId, limit));
  })
);

export default router;

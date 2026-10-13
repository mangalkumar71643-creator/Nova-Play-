import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getDiceConfig, getMyDiceHistory, rollDice } from "../services/diceService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getDiceConfig());
});

const rollSchema = z.object({
  stake: z.number().positive(),
  target: z.number().min(0).max(100),
  rollOver: z.boolean(),
});

router.post(
  "/roll",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, target, rollOver } = rollSchema.parse(req.body);
    res.status(201).json(await rollDice(req.user!.userId, stake, target, rollOver));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyDiceHistory(req.user!.userId, limit));
  })
);

export default router;

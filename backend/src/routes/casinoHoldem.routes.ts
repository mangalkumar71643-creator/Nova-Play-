import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { ACTIONS, actCasinoHoldem, dealCasinoHoldem, getActiveCasinoHoldemHand, getCasinoHoldemConfig, getMyCasinoHoldemHistory } from "../services/casinoHoldemService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getCasinoHoldemConfig());
});

const dealSchema = z.object({ ante: z.number().positive() });

router.post(
  "/deal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ante } = dealSchema.parse(req.body);
    res.status(201).json(await dealCasinoHoldem(req.user!.userId, ante));
  })
);

const actionSchema = z.object({ handId: z.string().min(1), action: z.enum(ACTIONS) });

router.post(
  "/action",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { handId, action } = actionSchema.parse(req.body);
    res.json(await actCasinoHoldem(req.user!.userId, handId, action));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ hand: await getActiveCasinoHoldemHand(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyCasinoHoldemHistory(req.user!.userId, limit));
  })
);

export default router;

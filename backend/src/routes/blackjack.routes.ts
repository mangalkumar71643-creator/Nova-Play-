import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { ACTIONS, actBlackjack, dealBlackjack, getActiveBlackjackHand, getBlackjackConfig, getMyBlackjackHistory } from "../services/blackjackService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getBlackjackConfig());
});

const dealSchema = z.object({ stake: z.number().positive() });

router.post(
  "/deal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = dealSchema.parse(req.body);
    res.status(201).json(await dealBlackjack(req.user!.userId, stake));
  })
);

const actionSchema = z.object({
  handId: z.string().min(1),
  action: z.enum(ACTIONS as [string, ...string[]]),
});

router.post(
  "/action",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { handId, action } = actionSchema.parse(req.body);
    res.json(await actBlackjack(req.user!.userId, handId, action as (typeof ACTIONS)[number]));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ hand: await getActiveBlackjackHand(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyBlackjackHistory(req.user!.userId, limit));
  })
);

export default router;

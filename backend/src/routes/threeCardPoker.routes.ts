import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { ACTIONS, actThreeCardPoker, dealThreeCardPoker, getActiveThreeCardPokerHand, getThreeCardPokerConfig, getMyThreeCardPokerHistory } from "../services/threeCardPokerService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getThreeCardPokerConfig());
});

const dealSchema = z.object({ ante: z.number().positive(), pairPlus: z.number().min(0).default(0) });

router.post(
  "/deal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ante, pairPlus } = dealSchema.parse(req.body);
    res.status(201).json(await dealThreeCardPoker(req.user!.userId, ante, pairPlus));
  })
);

const actionSchema = z.object({ handId: z.string().min(1), action: z.enum(ACTIONS) });

router.post(
  "/action",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { handId, action } = actionSchema.parse(req.body);
    res.json(await actThreeCardPoker(req.user!.userId, handId, action));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ hand: await getActiveThreeCardPokerHand(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyThreeCardPokerHistory(req.user!.userId, limit));
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  AREAS,
  cancelDragonTigerBets,
  getCurrentRoundView,
  getMyRoundBets,
  getMyDragonTigerBets,
  getDragonTigerConfig,
  getDragonTigerHistory,
  placeDragonTigerBets,
} from "../services/dragonTigerService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getDragonTigerConfig());
});

router.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json(await getCurrentRoundView());
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 100);
    res.json(await getDragonTigerHistory(limit));
  })
);

const betSchema = z.object({
  bets: z
    .array(z.object({ area: z.enum(AREAS), amount: z.number().positive() }))
    .min(1)
    .max(50),
});

router.post(
  "/bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bets } = betSchema.parse(req.body);
    res.status(201).json(await placeDragonTigerBets(req.user!.userId, bets));
  })
);

const cancelSchema = z.object({ betIds: z.array(z.string().min(1)).min(1).max(200).optional() });

router.post(
  "/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { betIds } = cancelSchema.parse(req.body ?? {});
    res.json(await cancelDragonTigerBets(req.user!.userId, betIds));
  })
);

router.get(
  "/my-round",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodNumber = typeof req.query.periodNumber === "string" ? req.query.periodNumber : undefined;
    res.json(await getMyRoundBets(req.user!.userId, periodNumber));
  })
);

router.get(
  "/my-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json(await getMyDragonTigerBets(req.user!.userId, limit));
  })
);

export default router;

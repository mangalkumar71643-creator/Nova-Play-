import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  advanceRingGauntletRound,
  autoRingGauntletRound,
  cashOutRingGauntletRound,
  getMyCurrentRingGauntletRound,
  getMyRingGauntletHistory,
  getRingGauntletConfig,
  partCashOutRingGauntletRound,
  startRingGauntletRound,
} from "../services/ringGauntletService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getRingGauntletConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentRingGauntletRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyRingGauntletHistory(req.user!.userId, limit));
  })
);

const ringSchema = z.enum(["OUTER", "MIDDLE", "INNER"]);

const startSchema = z.object({ stake: z.number().positive(), ring: ringSchema });

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, ring } = startSchema.parse(req.body);
    res.status(201).json(await startRingGauntletRound(req.user!.userId, stake, ring));
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });

router.post(
  "/advance",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await advanceRingGauntletRound(req.user!.userId, roundId));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutRingGauntletRound(req.user!.userId, roundId));
  })
);

router.post(
  "/part-cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await partCashOutRingGauntletRound(req.user!.userId, roundId));
  })
);

const autoSchema = z.object({ stake: z.number().positive(), ring: ringSchema, target: z.number().int().min(1).max(8) });

router.post(
  "/auto",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, ring, target } = autoSchema.parse(req.body);
    res.status(201).json(await autoRingGauntletRound(req.user!.userId, stake, ring, target));
  })
);

export default router;

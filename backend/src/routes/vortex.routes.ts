import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  cashOutVortexRound,
  getMyCurrentVortexRound,
  getMyVortexHistory,
  getVortexConfig,
  spinVortexRound,
  startVortexRound,
} from "../services/vortexService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getVortexConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentVortexRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyVortexHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({ stake: z.number().positive() });

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = startSchema.parse(req.body);
    res.status(201).json(await startVortexRound(req.user!.userId, stake));
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await spinVortexRound(req.user!.userId, roundId));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutVortexRound(req.user!.userId, roundId));
  })
);

export default router;

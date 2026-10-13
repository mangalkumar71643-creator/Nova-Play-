import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  cutWire,
  cashOutBomb,
  getBombConfig,
  getMyBombHistory,
  getMyCurrentBombRound,
  startBombRound,
} from "../services/bombService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getBombConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentBombRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyBombHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  live: z.union([z.literal(2), z.literal(3), z.literal(5)]),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, live } = startSchema.parse(req.body);
    const round = await startBombRound(req.user!.userId, stake, live);
    res.status(201).json(round);
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });
const cutSchema = z.object({ roundId: z.string().min(1), wire: z.number().int().min(0).max(7) });

router.post(
  "/cut",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, wire } = cutSchema.parse(req.body);
    res.json(await cutWire(req.user!.userId, roundId, wire));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutBomb(req.user!.userId, roundId));
  })
);

export default router;

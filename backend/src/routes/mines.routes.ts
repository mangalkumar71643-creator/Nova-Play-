import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  MAX_MINES,
  MIN_MINES,
  TILE_COUNT,
  cashOutMinesRound,
  getMinesConfig,
  getMyCurrentMinesRound,
  getMyMinesHistory,
  revealMinesTile,
  startMinesRound,
} from "../services/minesService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getMinesConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentMinesRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyMinesHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  mineCount: z.number().int().min(MIN_MINES).max(MAX_MINES),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, mineCount } = startSchema.parse(req.body);
    res.status(201).json(await startMinesRound(req.user!.userId, stake, mineCount));
  })
);

const revealSchema = z.object({
  roundId: z.string().min(1),
  tile: z.number().int().min(0).max(TILE_COUNT - 1),
});

router.post(
  "/reveal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, tile } = revealSchema.parse(req.body);
    res.json(await revealMinesTile(req.user!.userId, roundId, tile));
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutMinesRound(req.user!.userId, roundId));
  })
);

export default router;

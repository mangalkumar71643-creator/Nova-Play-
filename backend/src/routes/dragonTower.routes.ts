import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { DIFFICULTY_NAMES, Difficulty, cashOutDragonTower, getActiveDragonTowerRound, getDragonTowerConfig, getMyDragonTowerHistory, pickDragonTower, startDragonTower } from "../services/dragonTowerService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getDragonTowerConfig());
});

const startSchema = z.object({ stake: z.number().positive(), difficulty: z.enum(DIFFICULTY_NAMES as [Difficulty, ...Difficulty[]]) });

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, difficulty } = startSchema.parse(req.body);
    res.status(201).json(await startDragonTower(req.user!.userId, stake, difficulty));
  })
);

const pickSchema = z.object({ roundId: z.string().min(1), tile: z.number().int() });

router.post(
  "/pick",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, tile } = pickSchema.parse(req.body);
    res.json(await pickDragonTower(req.user!.userId, roundId, tile));
  })
);

const cashSchema = z.object({ roundId: z.string().min(1) });

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = cashSchema.parse(req.body);
    res.json(await cashOutDragonTower(req.user!.userId, roundId));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ round: await getActiveDragonTowerRound(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyDragonTowerHistory(req.user!.userId, limit));
  })
);

export default router;

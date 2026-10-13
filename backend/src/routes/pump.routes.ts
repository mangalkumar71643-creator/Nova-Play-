import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { DIFFICULTY_NAMES, Difficulty, cashOutPump, getActivePumpRound, getMyPumpHistory, getPumpConfig, pumpBalloon, startPump } from "../services/pumpService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getPumpConfig());
});

const startSchema = z.object({ stake: z.number().positive(), difficulty: z.enum(DIFFICULTY_NAMES as [Difficulty, ...Difficulty[]]) });

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, difficulty } = startSchema.parse(req.body);
    res.status(201).json(await startPump(req.user!.userId, stake, difficulty));
  })
);

const roundSchema = z.object({ roundId: z.string().min(1) });

router.post(
  "/pump",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundSchema.parse(req.body);
    res.json(await pumpBalloon(req.user!.userId, roundId));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundSchema.parse(req.body);
    res.json(await cashOutPump(req.user!.userId, roundId));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ round: await getActivePumpRound(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyPumpHistory(req.user!.userId, limit));
  })
);

export default router;

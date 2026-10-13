import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { ACTIONS, actHilo, getActiveHiloRound, getHiloConfig, getMyHiloHistory, startHilo } from "../services/hiloService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getHiloConfig());
});

const startSchema = z.object({ stake: z.number().positive() });

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = startSchema.parse(req.body);
    res.status(201).json(await startHilo(req.user!.userId, stake));
  })
);

const actionSchema = z.object({ roundId: z.string().min(1), action: z.enum(ACTIONS) });

router.post(
  "/action",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, action } = actionSchema.parse(req.body);
    res.json(await actHilo(req.user!.userId, roundId, action));
  })
);

router.get(
  "/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ round: await getActiveHiloRound(req.user!.userId) });
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyHiloHistory(req.user!.userId, limit));
  })
);

export default router;

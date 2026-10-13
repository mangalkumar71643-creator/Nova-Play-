import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  crackLock,
  cashOutVault,
  getVaultConfig,
  getMyVaultHistory,
  getMyCurrentVaultRound,
  startVaultRound,
} from "../services/vaultService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getVaultConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentVaultRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyVaultHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  alarms: z.union([z.literal(2), z.literal(4), z.literal(6)]),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, alarms } = startSchema.parse(req.body);
    const round = await startVaultRound(req.user!.userId, stake, alarms);
    res.status(201).json(round);
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });
const crackSchema = z.object({ roundId: z.string().min(1), digit: z.number().int().min(0).max(9) });

router.post(
  "/crack",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, digit } = crackSchema.parse(req.body);
    res.json(await crackLock(req.user!.userId, roundId, digit));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutVault(req.user!.userId, roundId));
  })
);

export default router;

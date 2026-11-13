import { Router } from "express";
import { z } from "zod";
import { ApiError, asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  LEGACY_UPDATE_MESSAGE,
  cashOutLegacyRound,
  cashOutVortex,
  getLegacyVortexConfig,
  getMyCurrentLegacyRound,
  getMyCurrentVortex,
  getMyLegacyVortexHistory,
  getMyVortexHistory,
  getVortexConfig,
  partPayoutVortex,
  spinVortex,
} from "../services/vortexService";

const router = Router();
const limitOf = (value: unknown) => Math.min(Number(value) || 30, 100);
const roundIdSchema = z.object({ roundId: z.string().min(1) });

// ---------- the rings game (app 1.0.78 on) ----------

router.get("/v2/config", (_req, res) => {
  res.json(getVortexConfig());
});

router.get(
  "/v2/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentVortex(req.user!.userId));
  })
);

router.get(
  "/v2/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyVortexHistory(req.user!.userId, limitOf(req.query.limit)));
  })
);

const spinSchema = z.object({ stake: z.number().positive() });

router.post(
  "/v2/spin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake } = spinSchema.parse(req.body);
    res.json(await spinVortex(req.user!.userId, stake));
  })
);

router.post(
  "/v2/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutVortex(req.user!.userId, roundId));
  })
);

router.post(
  "/v2/part-payout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await partPayoutVortex(req.user!.userId, roundId));
  })
);

// ---------- the old wheel game (apps up to 1.0.77; see vortexService.ts) ----------

router.get("/config", (_req, res) => {
  res.json(getLegacyVortexConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentLegacyRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyLegacyVortexHistory(req.user!.userId, limitOf(req.query.limit)));
  })
);

const noNewSpins = asyncHandler(async () => {
  throw new ApiError(426, LEGACY_UPDATE_MESSAGE);
});
router.post("/start", requireAuth, noNewSpins);
router.post("/spin", requireAuth, noNewSpins);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutLegacyRound(req.user!.userId, roundId));
  })
);

export default router;

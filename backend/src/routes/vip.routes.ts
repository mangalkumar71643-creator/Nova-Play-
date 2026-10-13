import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getRanking } from "../services/rankingService";
import { claimVipBonus, getVipStatus } from "../services/vipService";

const router = Router();

router.get(
  "/vip",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getVipStatus(req.user!.userId));
  })
);

const claimSchema = z.object({ kind: z.enum(["upgrade", "weekly"]), level: z.number().int().min(0).max(100) });
router.post(
  "/vip/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { kind, level } = claimSchema.parse(req.body);
    res.json(await claimVipBonus(req.user!.userId, kind, level));
  })
);

router.get(
  "/ranking",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getRanking(req.user!.userId));
  })
);

export default router;

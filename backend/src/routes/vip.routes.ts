import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getHotGames } from "../services/gameReportService";
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

// The Games page's "Hot" list: the 10 most played games.
router.get(
  "/hot-games",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ games: await getHotGames(10) });
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

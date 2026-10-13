import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getCurrentRoundView, getFiveDConfig, getFiveDHistory, getMyFiveDBets, placeFiveDBets } from "../services/fiveDService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getFiveDConfig());
});

router.get(
  "/my-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json(await getMyFiveDBets(req.user!.userId, limit));
  })
);

router.get(
  "/:duration/current",
  asyncHandler(async (req, res) => {
    res.json(await getCurrentRoundView(Number(req.params.duration)));
  })
);

router.get(
  "/:duration/history",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json(await getFiveDHistory(Number(req.params.duration), limit));
  })
);

const betSchema = z.object({
  // Checked against the bet table in the service.
  bets: z
    .array(z.object({ area: z.string().min(1).max(16), amount: z.number().positive() }))
    .min(1)
    .max(60),
});

router.post(
  "/:duration/bet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bets } = betSchema.parse(req.body);
    res.status(201).json(await placeFiveDBets(req.user!.userId, Number(req.params.duration), bets));
  })
);

export default router;

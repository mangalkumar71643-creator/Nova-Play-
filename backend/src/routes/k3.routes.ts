import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { getCurrentRoundView, getK3Config, getK3History, getMyK3Bets, placeK3Bets } from "../services/k3Service";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getK3Config());
});

router.get(
  "/my-bets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json(await getMyK3Bets(req.user!.userId, limit));
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
    res.json(await getK3History(Number(req.params.duration), limit));
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
    res.status(201).json(await placeK3Bets(req.user!.userId, Number(req.params.duration), bets));
  })
);

export default router;

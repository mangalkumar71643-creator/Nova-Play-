import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  claimAgentRewards,
  getAgentClaims,
  getAgentRewards,
  getAgentSummary,
  getAgentTeam,
  getJackpotHistory,
  getJackpotRanking,
} from "../services/agentService";

const router = Router();

/** Where invite links point: this server's own address (keeps an /api prefix when served under one). */
function baseUrl(req: { get(name: string): string | undefined; protocol: string; originalUrl: string }) {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${req.get("host")}${req.originalUrl.startsWith("/api/") ? "/api" : ""}`;
}

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getAgentSummary(req.user!.userId, baseUrl(req)));
  })
);

const rewardsQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  kind: z.enum(["BET", "DEPOSIT", "TASK", "INVITE", "JACKPOT"]).optional(),
});
router.get(
  "/rewards",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { month, kind } = rewardsQuery.parse(req.query);
    res.json(await getAgentRewards(req.user!.userId, month, kind));
  })
);

router.get(
  "/claims",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getAgentClaims(req.user!.userId));
  })
);

router.post(
  "/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await claimAgentRewards(req.user!.userId));
  })
);

const teamQuery = z.object({ depth: z.coerce.number().int().min(1).max(6).default(1) });
router.get(
  "/team",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { depth } = teamQuery.parse(req.query);
    res.json(await getAgentTeam(req.user!.userId, depth));
  })
);

router.get(
  "/jackpot",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getJackpotRanking(req.user!.userId));
  })
);

router.get(
  "/jackpot/history",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getJackpotHistory());
  })
);

export default router;

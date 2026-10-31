import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { claimTask, playerPromotionPage, playerTasks } from "../services/promotionService";

// The app's Promotion page (promotionService.ts).
const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await playerPromotionPage());
  })
);

router.get(
  "/tasks",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await playerTasks(req.user!.userId));
  })
);

router.post(
  "/tasks/:taskId/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await claimTask(req.user!.userId, req.params.taskId));
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { listNotifications, markRead } from "../services/playerNotificationService";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await listNotifications(req.user!.userId));
  })
);

const readSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });
router.post(
  "/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    await markRead(req.user!.userId, readSchema.parse(req.body ?? {}).ids);
    res.json({ ok: true });
  })
);

export default router;

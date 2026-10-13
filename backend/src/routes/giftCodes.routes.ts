import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { redeemGiftCode } from "../services/giftCodeService";

const router = Router();

const redeemSchema = z.object({ code: z.string().max(40) });

router.post(
  "/redeem",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = redeemSchema.parse(req.body);
    res.json(await redeemGiftCode(req.user!.userId, code));
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { kycProvider } from "../services/kycService";

const router = Router();

const submitSchema = z.object({
  documentType: z.string().min(1),
  documentReference: z.string().min(1),
});

router.post(
  "/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = submitSchema.parse(req.body);
    const userId = req.user!.userId;

    const result = await kycProvider.submit({ userId, ...input });

    const verification = await prisma.kycVerification.create({
      data: {
        userId,
        provider: result.provider,
        providerReferenceId: result.providerReferenceId,
        status: result.status,
        rawResult: result.rawResult as any,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { kycStatus: result.status },
    });

    res.status(201).json(verification);
  })
);

router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: { kycStatus: true },
    });
    res.json(user);
  })
);

export default router;

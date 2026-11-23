import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  clubAction,
  createPrivateClubTable,
  getClubConfig,
  getClubLobby,
  getMyClubHands,
  getMyClubTable,
  joinClubByCode,
  joinClubTable,
  leaveClubTable,
  startPrivateClubTable,
} from "../services/teenPattiClubService";
import { ACTION_KINDS } from "../services/teenPattiClubEngine";

const router = Router();

/** Boots, limits, the rake and the clocks: what the app shows in its rules. */
router.get("/config", (_req, res) => {
  res.json(getClubConfig());
});

router.get(
  "/lobby",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getClubLobby(req.user!.userId));
  })
);

const sitSchema = z.object({ boot: z.number().positive(), seats: z.number().int() });

/** Quick play: sit at the first table of that boot and size with a free seat (or a new one). */
router.post(
  "/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { boot, seats } = sitSchema.parse(req.body);
    res.json(await joinClubTable(req.user!.userId, boot, seats));
  })
);

/** A table for friends, with a code to share. */
router.post(
  "/private",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { boot, seats } = sitSchema.parse(req.body);
    res.json(await createPrivateClubTable(req.user!.userId, boot, seats));
  })
);

router.post(
  "/join-code",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(4).max(12) }).parse(req.body);
    res.json(await joinClubByCode(req.user!.userId, code));
  })
);

/** The host of a friends' table starts it with the players who are there. */
router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await startPrivateClubTable(req.user!.userId));
  })
);

/** The player's table, as they should see it now. `?since=<version>`: "unchanged" when nothing happened since. */
router.get(
  "/table",
  requireAuth,
  asyncHandler(async (req, res) => {
    const since = req.query.since !== undefined ? Number(req.query.since) : undefined;
    res.setHeader("Cache-Control", "no-store");
    res.json(await getMyClubTable(req.user!.userId, Number.isFinite(since) ? since : undefined));
  })
);

const actionSchema = z.object({
  action: z.enum(ACTION_KINDS as [string, ...string[]]),
  /** The turn the app was showing when the player tapped; a move for an older turn is turned away. */
  turnNo: z.number().int().optional(),
});

router.post(
  "/action",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { action, turnNo } = actionSchema.parse(req.body);
    res.json(await clubAction(req.user!.userId, action as (typeof ACTION_KINDS)[number], turnNo));
  })
);

router.post(
  "/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await leaveClubTable(req.user!.userId));
  })
);

router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyClubHands(req.user!.userId, limit));
  })
);

export default router;

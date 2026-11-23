import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  clubAction,
  createClubTable,
  getClubConfig,
  getClubLobby,
  getMyClubHands,
  getMyClubTable,
  joinClubByCode,
  joinClubTable,
  joinOpenClubTable,
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
    res.json(await getClubLobby(req.user!.userId, req.header("X-App-Version")));
  })
);

const sitSchema = z.object({ boot: z.number().positive(), seats: z.number().int() });

/** Quick play: sit at the first table of that boot and size with a free seat (or a new one). */
router.post(
  "/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { boot, seats } = sitSchema.parse(req.body);
    res.json(await joinClubTable(req.user!.userId, boot, seats, req.header("X-App-Version")));
  })
);

/** A table the player makes: their own boot and size, private (a code to share) or open (listed in the lobby). */
router.post(
  "/create",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { boot, seats, isPrivate } = z.object({ boot: z.number().positive(), seats: z.number().int(), isPrivate: z.boolean() }).parse(req.body);
    res.json(await createClubTable(req.user!.userId, boot, seats, isPrivate, req.header("X-App-Version")));
  })
);

/** The same as /create with isPrivate = true (what app 1.0.121 calls). */
router.post(
  "/private",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { boot, seats } = sitSchema.parse(req.body);
    res.json(await createClubTable(req.user!.userId, boot, seats, true, req.header("X-App-Version")));
  })
);

/** Sits at one of the open tables of the lobby's list. */
router.post(
  "/join-table",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tableId } = z.object({ tableId: z.string().min(1).max(64) }).parse(req.body);
    res.json(await joinOpenClubTable(req.user!.userId, tableId, req.header("X-App-Version")));
  })
);

router.post(
  "/join-code",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(4).max(12) }).parse(req.body);
    res.json(await joinClubByCode(req.user!.userId, code, req.header("X-App-Version")));
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

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { assertCanTransact } from "./responsibleGamblingService";
import { SOURCES } from "./gameReportService";
import { listLivePopups } from "./popupService";
import { istDayStart } from "./vipService";

/**
 * The app's Promotion page (Setting "promotion", panel → Promotion):
 *   - tiles: the icon grid, each opening an app screen; the admin shows,
 *     hides and renames them (the set of screens is fixed here);
 *   - banners: image cards (Popup rows of kind PROMOTION, uploaded on the
 *     same page), each opening a screen;
 *   - betting tasks: "stake ₹X in <category> today / this week → +₹Y".
 *     Progress is the player's stake in that category's games since the day
 *     (India time) or the week (Monday) began, read from every game's own
 *     bet table (gameReportService.SOURCES). A finished task is claimed by
 *     the player, once per period (PromoTaskClaim's unique key), and paid
 *     into the balance as a BONUS, like the VIP bonuses.
 */
const PROMOTION_KEY = "promotion";

/** Every tile the page can show: the app screen it opens, its icon and default name. */
export const TILE_CATALOG = [
  { key: "betting-tasks", label: "Betting tasks", icon: "medal" },
  { key: "deposit-bonus", label: "Deposit bonus", icon: "cash-plus" },
  { key: "invite", label: "Invitation bonus", icon: "account-multiple-plus" },
  { key: "betting-rebate", label: "Betting rebate", icon: "cash-refund" },
  { key: "super-jackpot", label: "Super jackpot", icon: "trophy" },
  { key: "vip", label: "VIP rewards", icon: "crown" },
  { key: "gift-code", label: "Gift code", icon: "gift" },
  { key: "support", label: "Customer service", icon: "headset" },
] as const;
export type TileKey = (typeof TILE_CATALOG)[number]["key"];

/** Task categories: the Home categories of the games (SOURCES' category), plus every game together. */
export const TASK_CATEGORIES = ["All games", "Lottery", "Slots", "Card & Table", "Crash", "Dice & Instant", "Mines & Cash-out"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export type PromoTile = { key: TileKey; label: string; visible: boolean };
export type PromoTask = { id: string; period: "daily" | "weekly"; category: TaskCategory; target: number; reward: number };
export type PromotionConfig = { tiles: PromoTile[]; tasks: PromoTask[] };

export const MAX_TASKS = 60;

const DEFAULT_CONFIG: PromotionConfig = {
  tiles: TILE_CATALOG.map((t) => ({ key: t.key, label: t.label, visible: true })),
  tasks: [],
};

/** Saved tiles in their saved order, plus any tile added to the catalog since (shown, at the end). */
function withAllTiles(tiles: PromoTile[]): PromoTile[] {
  const known = tiles.filter((t) => TILE_CATALOG.some((c) => c.key === t.key));
  const missing = TILE_CATALOG.filter((c) => !known.some((t) => t.key === c.key)).map((c) => ({ key: c.key, label: c.label, visible: true }));
  return [...known, ...missing];
}

export async function getPromotionConfig(): Promise<PromotionConfig> {
  const row = await prisma.setting.findUnique({ where: { key: PROMOTION_KEY } });
  if (!row) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<PromotionConfig>;
    return { tiles: withAllTiles(parsed.tiles ?? []), tasks: parsed.tasks ?? [] };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setPromotionConfig(config: PromotionConfig) {
  const value = JSON.stringify({ tiles: withAllTiles(config.tiles), tasks: config.tasks });
  await prisma.setting.upsert({ where: { key: PROMOTION_KEY }, update: { value }, create: { key: PROMOTION_KEY, value } });
  return getPromotionConfig();
}

// --- Periods (India time) ---

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const isoDay = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Monday 00:00 India time of the current week. */
function istWeekStart(now = new Date()) {
  const day = istDayStart(now);
  const weekday = new Date(day.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  const back = (weekday + 6) % 7;
  return new Date(day.getTime() - back * 24 * 3600 * 1000);
}

function periodOf(task: PromoTask) {
  const start = task.period === "daily" ? istDayStart() : istWeekStart();
  const key = task.period === "daily" ? isoDay(start) : `W${isoDay(start)}`;
  const resetsAt = new Date(start.getTime() + (task.period === "daily" ? 1 : 7) * 24 * 3600 * 1000);
  return { start, key, resetsAt };
}

/** What the player staked per category since `since`, from every game's bet table. */
async function stakedByCategory(userId: string, since: Date, db: Prisma.TransactionClient | typeof prisma = prisma) {
  // Built only from the fixed SOURCES list; the player and the date go in as parameters.
  const parts = SOURCES.filter((s) => s.category !== "Retired").map(
    (s) =>
      `SELECT '${s.category}' AS category, COALESCE(SUM(${s.stake}), 0) AS staked FROM "${s.table}" t WHERE t."userId" = $1 AND t."createdAt" >= $2${s.where ? ` AND ${s.where}` : ""}`
  );
  const rows = await db.$queryRawUnsafe<{ category: string; staked: unknown }[]>(parts.join("\nUNION ALL\n"), userId, since);
  const out = new Map<string, number>();
  let all = 0;
  for (const r of rows) {
    const n = Number(r.staked);
    out.set(r.category, (out.get(r.category) ?? 0) + n);
    all += n;
  }
  out.set("All games", all);
  return out;
}

async function progressFor(userId: string, tasks: PromoTask[], db: Prisma.TransactionClient | typeof prisma = prisma) {
  const need = { daily: tasks.some((t) => t.period === "daily"), weekly: tasks.some((t) => t.period === "weekly") };
  const [daily, weekly] = await Promise.all([
    need.daily ? stakedByCategory(userId, istDayStart(), db) : Promise.resolve(new Map<string, number>()),
    need.weekly ? stakedByCategory(userId, istWeekStart(), db) : Promise.resolve(new Map<string, number>()),
  ]);
  return (t: PromoTask) => Math.floor(((t.period === "daily" ? daily : weekly).get(t.category) ?? 0) * 100) / 100;
}

// --- The player's side ---

/** The page: visible tiles in order and the banner cards. */
export async function playerPromotionPage() {
  const [config, banners] = await Promise.all([getPromotionConfig(), listLivePopups("PROMOTION")]);
  return {
    tiles: config.tiles.filter((t) => t.visible).map((t) => ({ ...t, icon: TILE_CATALOG.find((c) => c.key === t.key)!.icon })),
    banners,
  };
}

export async function playerTasks(userId: string) {
  const { tasks } = await getPromotionConfig();
  if (tasks.length === 0) return { tasks: [] };
  const progress = await progressFor(userId, tasks);
  const keys = [...new Set(tasks.map((t) => periodOf(t).key))];
  const claims = await prisma.promoTaskClaim.findMany({ where: { userId, periodKey: { in: keys } }, select: { taskId: true, periodKey: true } });
  return {
    tasks: tasks.map((t) => {
      const p = periodOf(t);
      const done = progress(t);
      return {
        ...t,
        progress: Math.min(done, t.target),
        complete: done >= t.target,
        claimed: claims.some((c) => c.taskId === t.id && c.periodKey === p.key),
        resetsAt: p.resetsAt,
      };
    }),
  };
}

/** Pays a finished task's reward, once per period. */
export async function claimTask(userId: string, taskId: string) {
  await assertCanTransact(userId);
  const { tasks } = await getPromotionConfig();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new ApiError(404, "This task is no longer offered.");
  const { key } = periodOf(task);

  return prisma.$transaction(async (tx) => {
    // One claim at a time per player, so the check and the payment can't race.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const done = (await progressFor(userId, [task], tx))(task);
    if (done < task.target) throw new ApiError(400, `Bet ₹${(task.target - done).toLocaleString("en-IN")} more in ${task.category} to finish this task.`);
    const exists = await tx.promoTaskClaim.findUnique({ where: { userId_taskId_periodKey: { userId, taskId, periodKey: key } }, select: { id: true } });
    if (exists) throw new ApiError(409, task.period === "daily" ? "Already claimed today." : "Already claimed this week.");
    await tx.promoTaskClaim.create({ data: { userId, taskId, periodKey: key, amount: task.reward } });
    const wallet = await tx.wallet.upsert({ where: { userId }, update: { balance: { increment: task.reward } }, create: { userId, balance: task.reward } });
    await tx.transaction.create({ data: { userId, type: "BONUS", amount: task.reward, status: "COMPLETED", provider: "betting-task" } });
    return { amount: task.reward, balance: Number(wallet.balance) };
  });
}

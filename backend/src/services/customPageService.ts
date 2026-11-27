import { z } from "zod";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";

/**
 * Custom pages (Admin → Pages; owner's request, 2026-11-26: "a banner should open my own page, not only a game"). A page is a list
 * of blocks shown top to bottom in the app: pictures (full width, the admin's own designs), text, and buttons. A banner, an
 * app-open popup, a Promotion card, a category banner, a picture or a button on a page can open:
 *  - a game: its app screen name ("Aviator", "WinGo", ...),
 *  - "Deposit": the deposit screen,
 *  - "page:<id>": a custom page,
 *  - "url:https://...": a website (a Telegram channel, WhatsApp support...), opened in the phone's browser (app 1.0.136+),
 *  - "DOWNLOAD": the app download (website only; popups and slides).
 * Apps ignore targets they don't know (an app older than 1.0.133 shows such a button without opening anything).
 *
 * Admin → Promotion Pages (owner, 2026-11-27: "first the banner, then its page, with every tool a page may need") builds the
 * pages with these blocks: picture, text (heading / text / note, a colour), button (a colour), list, table, notice box, countdown,
 * code (with Copy), questions & answers, divider and space; a page also has a background colour. An app older than 1.0.136 shows
 * the newer blocks as plain text (each carries a `text` fallback) and leaves out what it can't show.
 */

export const PAGE_TARGET_PREFIX = "page:";
export const URL_TARGET_PREFIX = "url:";
export const TARGET_RE = /^([A-Za-z0-9]{1,40}|page:[0-9a-f-]{36}|url:https?:\/\/[^\s"'<>]{1,490})$/;

/** A website target must be a plain http(s) address. */
export function isWebTarget(t: string): boolean {
  if (!t.startsWith(URL_TARGET_PREFIX)) return false;
  try {
    const u = new URL(t.slice(URL_TARGET_PREFIX.length));
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** What a banner, a popup, a page's picture or button opens: TARGET_RE, and a website must be a real address. */
export const targetSchema = z
  .string()
  .trim()
  .regex(TARGET_RE, "Pick what it opens.")
  .refine((t) => !t.startsWith(URL_TARGET_PREFIX) || isWebTarget(t), "That website link is not a valid http(s) address.");
export const PAGE_IMAGE_MIME_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type PageImageMimeType = (typeof PAGE_IMAGE_MIME_TYPES)[number];
/** Decoded picture size cap; the panel shrinks uploads (1080 px wide) well under this. */
export const MAX_PAGE_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_BLOCKS = 60;
/** The colours a button, a notice box and text can take (the app draws each). */
export const PAGE_COLORS = ["gold", "red", "green", "blue", "purple"] as const;
export const TEXT_COLORS = ["default", "gold", "white", "red", "green"] as const;
/** The page's background (the app draws each as a dark gradient of that colour). */
export const PAGE_BACKGROUNDS = ["dark", "red", "blue", "purple", "green"] as const;

const target = targetSchema;
const line = (max: number, what: string) => z.string().trim().min(1, what).max(max);
export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    imageId: z.string().uuid(),
    // tapping the picture (optional)
    target: z.union([z.literal(""), target]).nullish().transform((v) => v || null),
  }),
  z.object({
    type: z.literal("text"),
    text: z.string().trim().min(1, "A text block is empty.").max(3000),
    style: z.enum(["heading", "body", "note"]).default("body"),
    align: z.enum(["left", "center"]).default("left"),
    color: z.enum(TEXT_COLORS).default("default"),
  }),
  z.object({ type: z.literal("button"), label: z.string().trim().min(1, "A button has no text.").max(30), target, color: z.enum(PAGE_COLORS).default("red") }),
  z.object({
    type: z.literal("list"),
    items: z.array(line(300, "A list has an empty line.")).min(1, "A list is empty.").max(30, "A list can have at most 30 lines."),
    ordered: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("table"),
    rows: z
      .array(z.array(z.string().trim().max(120)).min(1).max(6, "A table can have at most 6 columns."))
      .min(1, "A table is empty.")
      .max(40, "A table can have at most 40 rows.")
      .refine((rows) => rows.every((r) => r.length === rows[0].length), "Every row of a table needs the same number of columns.")
      .refine((rows) => rows.some((r) => r.some((c) => c !== "")), "A table is empty."),
    header: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("box"),
    title: z.string().trim().max(80).default(""),
    text: line(2000, "A notice box is empty."),
    color: z.enum(PAGE_COLORS).default("gold"),
  }),
  z.object({
    type: z.literal("countdown"),
    label: z.string().trim().max(60).default("Offer ends in"),
    endsAt: z.string().datetime({ offset: true, message: "Pick when the countdown ends." }),
    endedText: z.string().trim().max(80).default("This offer has ended."),
  }),
  z.object({ type: z.literal("code"), label: z.string().trim().max(60).default(""), code: line(40, "A code block has no code.") }),
  z.object({
    type: z.literal("faq"),
    items: z
      .array(z.object({ q: line(200, "A question is empty."), a: line(1500, "An answer is empty.") }))
      .min(1, "Questions & answers is empty.")
      .max(20, "At most 20 questions."),
  }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("space"), size: z.enum(["s", "m", "l"]).default("m") }),
]);
export const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS, `A page can have at most ${MAX_BLOCKS} blocks.`);
export type PageBlock = z.infer<typeof blockSchema>;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];
const blocksWithTarget = (blocks: PageBlock[]) => blocks.flatMap((b) => (b.type === "image" || b.type === "button" ? [b.target] : []));
/** A block as the apps get it: a picture also carries its URL and size; the newer blocks carry a plain `text` too, which an app older
 * than 1.0.136 shows instead (it shows any block it doesn't know as text). */
type ShownBlock =
  | Exclude<PageBlock, { type: "image" }>
  | (Extract<PageBlock, { type: "image" }> & { imageUrl: string; width: number; height: number })
  | (PageBlock & { text?: string });

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/** The plain-text stand-in an older app shows for a block it doesn't know (a notice box already has its own `text`, which an older app
 * shows without the title). */
export function fallbackText(b: PageBlock): string | undefined {
  switch (b.type) {
    case "list":
      return b.items.map((t, i) => (b.ordered ? `${i + 1}. ${t}` : `• ${t}`)).join("\n");
    case "table":
      return b.rows.map((r) => r.join("  |  ")).join("\n");
    case "countdown": {
      const end = new Date(b.endsAt);
      return end.getTime() > Date.now() ? `${b.label || "Ends"}: ${IST.format(end)} (IST)` : b.endedText;
    }
    case "code":
      return b.label ? `${b.label}: ${b.code}` : b.code;
    case "faq":
      return b.items.map((x) => `${x.q}\n${x.a}`).join("\n\n");
    default:
      return undefined;
  }
}

export function pageIdOf(t: string | null | undefined): string | null {
  return t && t.startsWith(PAGE_TARGET_PREFIX) ? t.slice(PAGE_TARGET_PREFIX.length) : null;
}

function imageUrl(id: string) {
  return `/pages/images/${id}`;
}

/** Ids of the pages players can open now (shown, not deleted). */
export async function livePageIds(ids?: string[]): Promise<Set<string>> {
  if (ids && ids.length === 0) return new Set();
  const rows = await prisma.customPage.findMany({ where: { deletedAt: null, active: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** A target as players get it: a page that is hidden or gone leads nowhere (null). */
export function liveTarget(t: string | null | undefined, live: Set<string>): string | null {
  if (!t) return null;
  const pageId = pageIdOf(t);
  return pageId && !live.has(pageId) ? null : t;
}

function storedBlocks(raw: unknown): PageBlock[] {
  const parsed = blocksSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** The blocks with what the app needs to lay the pictures out before they load (size and URL). */
async function withImages(blocks: PageBlock[]): Promise<ShownBlock[]> {
  const ids = blocks.flatMap((b) => (b.type === "image" ? [b.imageId] : []));
  const rows = ids.length ? await prisma.customPageImage.findMany({ where: { id: { in: ids } }, select: { id: true, width: true, height: true } }) : [];
  const size = new Map(rows.map((r) => [r.id, r]));
  return blocks.flatMap((b): ShownBlock[] => {
    if (b.type !== "image") return [b];
    const s = size.get(b.imageId);
    return s ? [{ ...b, imageUrl: imageUrl(b.imageId), width: s.width, height: s.height }] : [];
  });
}

function backgroundOf(v: unknown): PageBackground {
  return (PAGE_BACKGROUNDS as readonly string[]).includes(v as string) ? (v as PageBackground) : "dark";
}

/** A shown page, for the app. Buttons that lead to a page that is hidden or gone are left out, pictures then lead nowhere. */
export async function getLivePage(id: string) {
  const row = await prisma.customPage.findFirst({ where: { id, deletedAt: null, active: true } });
  if (!row) throw new ApiError(404, "This page is not available any more.");
  const blocks = await withImages(storedBlocks(row.blocks));
  const linked = blocksWithTarget(blocks).map(pageIdOf).filter((x): x is string => !!x);
  const live = await livePageIds(linked);
  const shown = blocks.flatMap((b): ShownBlock[] => {
    if (b.type === "button") {
      const t = liveTarget(b.target, live);
      return t ? [{ ...b, target: t }] : [];
    }
    if (b.type === "image") return [{ ...b, target: liveTarget(b.target, live) }];
    const text = fallbackText(b);
    return [text === undefined ? b : { ...b, text }];
  });
  return { id: row.id, title: row.title, background: backgroundOf(row.background), updatedAt: row.updatedAt, blocks: shown };
}

export async function getPageImage(id: string) {
  const row = await prisma.customPageImage.findUnique({ where: { id }, select: { image: true, mimeType: true } });
  if (!row) throw new ApiError(404, "Picture not found");
  return row;
}

// ---------- the admin's side ----------

export async function listPages() {
  const rows = await prisma.customPage.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  return Promise.all(
    rows.map(async (r) => ({ id: r.id, title: r.title, active: r.active, background: backgroundOf(r.background), createdAt: r.createdAt, updatedAt: r.updatedAt, blocks: await withImages(storedBlocks(r.blocks)) }))
  );
}

/** Every picture must have been uploaded, and every page a block opens must exist (not deleted). */
async function checkBlocks(blocks: PageBlock[]) {
  const imageIds = [...new Set(blocks.flatMap((b) => (b.type === "image" ? [b.imageId] : [])))];
  if (imageIds.length) {
    const found = await prisma.customPageImage.count({ where: { id: { in: imageIds } } });
    if (found !== imageIds.length) throw new ApiError(400, "A picture on the page was not found. Upload it again.");
  }
  const pageIds = [...new Set(blocksWithTarget(blocks).map(pageIdOf).filter((x): x is string => !!x))];
  if (pageIds.length) {
    const found = await prisma.customPage.count({ where: { id: { in: pageIds }, deletedAt: null } });
    if (found !== pageIds.length) throw new ApiError(400, "A button opens a page that was deleted. Pick another one.");
  }
}

/** A banner's / popup's target must be a page that exists, when it is a page. */
export async function checkTarget(t: string | null | undefined) {
  const pageId = pageIdOf(t);
  if (!pageId) return;
  const found = await prisma.customPage.count({ where: { id: pageId, deletedAt: null } });
  if (!found) throw new ApiError(400, "That page was deleted. Pick another one.");
}

export async function createPage(input: { title: string; blocks: PageBlock[]; background?: PageBackground }) {
  await checkBlocks(input.blocks);
  const row = await prisma.customPage.create({ data: { title: input.title, blocks: input.blocks, background: input.background ?? "dark" } });
  return { id: row.id };
}

export async function updatePage(id: string, input: { title?: string; blocks?: PageBlock[]; active?: boolean; background?: PageBackground }) {
  const found = await prisma.customPage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Page not found");
  if (input.blocks) await checkBlocks(input.blocks);
  await prisma.customPage.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.blocks ? { blocks: input.blocks } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.background !== undefined ? { background: input.background } : {}),
    },
  });
  return { id };
}

/** The page goes (banners and buttons that opened it then lead nowhere); its pictures stay, other pages may use them. */
export async function deletePage(id: string) {
  const found = await prisma.customPage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Page not found");
  await prisma.customPage.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
}

export async function uploadPageImage(input: { imageBase64: string; mimeType: PageImageMimeType; width: number; height: number }) {
  const image = Buffer.from(input.imageBase64, "base64");
  if (image.length === 0) throw new ApiError(400, "The picture is empty.");
  if (image.length > MAX_PAGE_IMAGE_BYTES) throw new ApiError(400, "The picture is too large (max 3 MB).");
  const row = await prisma.customPageImage.create({ data: { image, mimeType: input.mimeType, width: input.width, height: input.height }, select: { id: true, width: true, height: true } });
  return { id: row.id, imageUrl: imageUrl(row.id), width: row.width, height: row.height };
}

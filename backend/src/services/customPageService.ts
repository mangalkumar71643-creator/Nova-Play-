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
 *
 * Owner, 2026-11-28 ("where is my picture; text on the picture; a big background picture"; app 1.0.137): a picture has a size
 * (full width, large, medium, small) and can have round corners; "hero" is a picture with a heading, text and a button on it
 * (at its top, middle or bottom, with a shade); a page can have a background picture (behind everything, scrolling with the
 * page) with a shade; a banner's own picture can be copied into its page (copyBannerPicture).
 *
 * Owner, 2026-11-28 ("an editor app in the admin: the page's height and everything on it, edited freely"; app 1.0.138): "canvas" is
 * a free design made in the panel's design editor (admin-design-editor.js): a canvas 360 units wide and as tall as the admin
 * sets, with text, pictures, buttons and shapes placed anywhere. The panel saves the design (to edit it again), the picture it
 * draws of it (1080 px wide, in parts at most 2400 px tall, one under the other: an older or smaller phone can't draw one very
 * tall picture) and the areas that open something when tapped. An app that asks with ?v=3 shows the parts with those areas on
 * them; an older app gets the parts as plain pictures (opening the one thing, when there is one) and a button under them for each
 * thing it opens when there are more.
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
/** How wide a picture is drawn: the whole width, or 85 / 65 / 45 % of it, centred. */
export const PICTURE_SIZES = ["full", "large", "medium", "small"] as const;
/** How much a picture with text on it (or a page's background picture) is darkened. */
export const SHADES = ["none", "light", "medium", "strong"] as const;
/** The design editor's canvas width (a phone's width, in the editor's units) and the fonts it offers. */
export const DESIGN_WIDTH = 360;
export const DESIGN_FONTS = ["Montserrat", "Poppins", "Bebas Neue", "Anton", "Playfair Display", "Pacifico"] as const;

const target = targetSchema;
const line = (max: number, what: string) => z.string().trim().min(1, what).max(max);

// ----- the design editor's canvas
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const COLOR = z.string().regex(/^(#[0-9a-fA-F]{6}|transparent)$/, "A colour is not valid.");
const optColor = z.union([z.literal(""), COLOR]).nullish().transform((v) => v || null);
const optTarget = z.union([z.literal(""), target]).nullish().transform((v) => v || null);
const designBase = {
  id: z.string().max(40),
  x: num(-4000, 4000),
  y: num(-4000, 12000),
  w: num(1, 8000),
  h: num(1, 12000),
  rot: num(-360, 360).default(0),
  opacity: num(0, 1).default(1),
  target: optTarget,
};
const designElement = z.discriminatedUnion("kind", [
  z.object({
    ...designBase,
    kind: z.literal("text"),
    text: z.string().max(2000),
    font: z.enum(DESIGN_FONTS).default("Montserrat"),
    size: num(4, 400),
    weight: z.enum(["400", "600", "700", "800", "900"]).default("800"),
    color: COLOR.default("#FFFFFF"),
    align: z.enum(["left", "center", "right"]).default("center"),
    lineHeight: num(0.5, 4).default(1.2),
    shadow: z.boolean().default(false),
    stroke: optColor,
    strokeWidth: num(0, 40).default(0),
  }),
  z.object({ ...designBase, kind: z.literal("image"), imageId: z.string().uuid(), fit: z.enum(["cover", "contain"]).default("cover"), radius: num(0, 4000).default(0) }),
  z.object({ ...designBase, kind: z.literal("button"), label: z.string().max(40), tone: z.enum(PAGE_COLORS).default("red"), textColor: optColor, radius: num(0, 4000).default(999) }),
  z.object({
    ...designBase,
    kind: z.literal("shape"),
    shape: z.enum(["rect", "circle"]).default("rect"),
    fill: optColor,
    radius: num(0, 4000).default(0),
    border: optColor,
    borderWidth: num(0, 80).default(0),
  }),
]);
export const designSchema = z.object({
  w: z.literal(DESIGN_WIDTH),
  h: num(100, 4000),
  bg: z.object({
    color: COLOR.default("#170709"),
    color2: optColor,
    imageId: z.string().uuid().nullish().transform((v) => v || null),
    fit: z.enum(["cover", "width"]).default("cover"),
    shade: num(0, 0.95).default(0),
  }),
  els: z.array(designElement).max(150, "A design can have at most 150 parts."),
});
const designLink = z.object({ x: num(-10, 400), y: num(-10, 4100), w: num(1, 400), h: num(1, 4100), target, label: z.string().max(60).default("") });
export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    imageId: z.string().uuid(),
    // tapping the picture (optional)
    target: z.union([z.literal(""), target]).nullish().transform((v) => v || null),
    size: z.enum(PICTURE_SIZES).default("full"),
    rounded: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("hero"),
    imageId: z.string().uuid(),
    heading: z.string().trim().max(120).default(""),
    text: z.string().trim().max(600).default(""),
    buttonLabel: z.string().trim().max(30).default(""),
    buttonTarget: z.union([z.literal(""), target]).nullish().transform((v) => v || null),
    buttonColor: z.enum(PAGE_COLORS).default("red"),
    position: z.enum(["top", "middle", "bottom"]).default("bottom"),
    align: z.enum(["left", "center"]).default("center"),
    shade: z.enum(SHADES).default("medium"),
    textColor: z.enum(["white", "gold"]).default("white"),
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
  z.object({
    type: z.literal("canvas"),
    design: designSchema,
    // the design's picture, in parts top to bottom
    imageIds: z.array(z.string().uuid()).min(1, "A design was not saved.").max(12),
    links: z.array(designLink).max(80).default([]),
  }),
]);
export const blocksSchema = z
  .array(blockSchema)
  .max(MAX_BLOCKS, `A page can have at most ${MAX_BLOCKS} blocks.`)
  .refine((blocks) => blocks.every((b) => b.type !== "hero" || !b.buttonLabel || !!b.buttonTarget), "A picture's button needs something to open.");
export type PageBlock = z.infer<typeof blockSchema>;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];
const blocksWithTarget = (blocks: PageBlock[]) =>
  blocks.flatMap((b) =>
    b.type === "image" || b.type === "button"
      ? [b.target]
      : b.type === "hero"
        ? [b.buttonTarget]
        : b.type === "canvas"
          ? [...b.links.map((l) => l.target), ...b.design.els.map((e) => e.target)]
          : []
  );
/** The pictures a page's blocks show (a design: the parts of its own picture). */
const blockImageIds = (blocks: PageBlock[]) =>
  blocks.flatMap((b) => (b.type === "image" || b.type === "hero" ? [b.imageId] : b.type === "canvas" ? b.imageIds : []));
/** Every picture a page needs to exist: also the ones a design is made of. */
const allImageIds = (blocks: PageBlock[]) =>
  blocks.flatMap((b) =>
    b.type === "canvas"
      ? [...b.imageIds, ...b.design.els.flatMap((e) => (e.kind === "image" ? [e.imageId] : [])), ...(b.design.bg.imageId ? [b.design.bg.imageId] : [])]
      : blockImageIds([b])
  );
/** A block as the apps get it: a picture also carries its URL and size; the newer blocks carry a plain `text` too, which an app older
 * than 1.0.136 shows instead (it shows any block it doesn't know as text). */
type Pictured = { imageUrl: string; width: number; height: number };
/** A design as shown: its picture's parts, top to bottom (and the whole picture's size). */
type ShownCanvas = Extract<PageBlock, { type: "canvas" }> & { parts: Pictured[]; width: number; height: number };
type ShownBlock =
  | Exclude<PageBlock, { type: "image" | "hero" }>
  | (Extract<PageBlock, { type: "image" }> & Pictured)
  | (Extract<PageBlock, { type: "hero" }> & Pictured & { text: string })
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
    case "hero":
      return [b.heading, b.text].filter(Boolean).join("\n");
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
  const ids = blockImageIds(blocks);
  const rows = ids.length ? await prisma.customPageImage.findMany({ where: { id: { in: ids } }, select: { id: true, width: true, height: true } }) : [];
  const size = new Map(rows.map((r) => [r.id, r]));
  return blocks.flatMap((b): ShownBlock[] => {
    if (b.type === "canvas") {
      const parts = b.imageIds.map((id) => size.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
      if (!parts.length || parts.length !== b.imageIds.length) return [];
      const shown: ShownCanvas = {
        ...b,
        parts: parts.map((s) => ({ imageUrl: imageUrl(s.id), width: s.width, height: s.height })),
        width: parts[0].width,
        height: parts.reduce((t, s) => t + s.height, 0),
      };
      return [shown as unknown as ShownBlock];
    }
    if (b.type !== "image" && b.type !== "hero") return [b];
    const s = size.get(b.imageId);
    if (!s) return [];
    return [{ ...b, imageUrl: imageUrl(b.imageId), width: s.width, height: s.height } as ShownBlock];
  });
}

/** A design, for an app that asks with ?v=3: its picture's parts and the areas that open something (the design itself stays here).
 * For an older app: the parts as pictures, one under the other (opening the one thing the design opens, when there is one), then a
 * button for each thing when there are more. */
function canvasForApps(b: ShownBlock, v: number, live: Set<string>): ShownBlock[] {
  const c = b as unknown as ShownCanvas;
  const links = c.links.filter((l) => !!liveTarget(l.target, live));
  if (v >= 3) {
    return [{ type: "canvas", parts: c.parts, width: c.width, height: c.height, designWidth: c.design.w, designHeight: c.design.h, links } as unknown as ShownBlock];
  }
  const out: ShownBlock[] = c.parts.map(
    (p, k): ShownBlock => ({ type: "image", imageId: c.imageIds[k], ...p, target: links.length === 1 ? links[0].target : null, size: "full", rounded: false })
  );
  if (links.length > 1) links.forEach((l) => out.push({ type: "button", label: (l.label || "OPEN").slice(0, 30), target: l.target, color: "red" }));
  return out;
}

/** A page's background picture, as the apps get it. */
async function backgroundPicture(id: string | null | undefined) {
  if (!id) return null;
  const row = await prisma.customPageImage.findUnique({ where: { id }, select: { id: true, width: true, height: true } });
  return row ? { imageUrl: imageUrl(row.id), width: row.width, height: row.height } : null;
}
function shadeOf(v: unknown): (typeof SHADES)[number] {
  return (SHADES as readonly string[]).includes(v as string) ? (v as (typeof SHADES)[number]) : "medium";
}

function backgroundOf(v: unknown): PageBackground {
  return (PAGE_BACKGROUNDS as readonly string[]).includes(v as string) ? (v as PageBackground) : "dark";
}

/** For an app that can't draw a picture with words on it (older than 1.0.137, which asks with ?v=2): the picture, then its heading,
 * its text and its button, one under the other. */
function heroForOlderApps(b: ShownBlock): ShownBlock[] {
  const h = b as unknown as Extract<PageBlock, { type: "hero" }> & Pictured;
  const out: ShownBlock[] = [{ type: "image", imageId: h.imageId, imageUrl: h.imageUrl, width: h.width, height: h.height, target: h.buttonTarget ?? null, size: "full", rounded: false }];
  if (h.heading) out.push({ type: "text", text: h.heading, style: "heading", align: "center", color: h.textColor === "gold" ? "gold" : "default" });
  if (h.text) out.push({ type: "text", text: h.text, style: "body", align: h.align, color: "default" });
  if (h.buttonLabel && h.buttonTarget) out.push({ type: "button", label: h.buttonLabel, target: h.buttonTarget, color: h.buttonColor });
  return out;
}

/** A shown page, for the app. Buttons that lead to a page that is hidden or gone are left out, pictures then lead nowhere.
 * `v` is what the app can draw: 2 (app 1.0.137+) gets pictures with words on them as they are. */
export async function getLivePage(id: string, opts: { v?: number } = {}) {
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
    if (b.type === "canvas") return canvasForApps(b, opts.v ?? 1, live);
    if (b.type === "hero") {
      const t = liveTarget(b.buttonTarget, live);
      const shown = { ...b, buttonTarget: t, buttonLabel: t ? b.buttonLabel : "" };
      if ((opts.v ?? 1) < 2) return heroForOlderApps(shown as ShownBlock);
      // the app reads `heading` and `body`; `text` (heading and text) is a stand-in for anything that can only show text
      return [{ ...shown, body: b.text, text: fallbackText(b) ?? "" } as unknown as ShownBlock];
    }
    const text = fallbackText(b);
    return [text === undefined ? b : { ...b, text }];
  });
  return {
    id: row.id,
    title: row.title,
    background: backgroundOf(row.background),
    backgroundImage: await backgroundPicture(row.bgImageId),
    backgroundShade: shadeOf(row.bgShade),
    updatedAt: row.updatedAt,
    blocks: shown,
  };
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
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      active: r.active,
      background: backgroundOf(r.background),
      bgImageId: r.bgImageId,
      backgroundImage: await backgroundPicture(r.bgImageId),
      backgroundShade: shadeOf(r.bgShade),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      blocks: await withImages(storedBlocks(r.blocks)),
    }))
  );
}

/** Every picture must have been uploaded, and every page a block opens must exist (not deleted). */
async function checkBlocks(blocks: PageBlock[], bgImageId?: string | null) {
  const imageIds = [...new Set([...allImageIds(blocks), ...(bgImageId ? [bgImageId] : [])])];
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

type PageLook = { background?: PageBackground; bgImageId?: string | null; bgShade?: (typeof SHADES)[number] };

export async function createPage(input: { title: string; blocks: PageBlock[] } & PageLook) {
  await checkBlocks(input.blocks, input.bgImageId);
  const row = await prisma.customPage.create({
    data: { title: input.title, blocks: input.blocks, background: input.background ?? "dark", bgImageId: input.bgImageId ?? null, bgShade: input.bgShade ?? "medium" },
  });
  return { id: row.id };
}

export async function updatePage(id: string, input: { title?: string; blocks?: PageBlock[]; active?: boolean } & PageLook) {
  const found = await prisma.customPage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Page not found");
  if (input.blocks || input.bgImageId) await checkBlocks(input.blocks ?? [], input.bgImageId);
  await prisma.customPage.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.blocks ? { blocks: input.blocks } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.background !== undefined ? { background: input.background } : {}),
      ...(input.bgImageId !== undefined ? { bgImageId: input.bgImageId } : {}),
      ...(input.bgShade !== undefined ? { bgShade: input.bgShade } : {}),
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

/** A banner's (or popup's) own picture, copied for a page (Promotion Pages: "the banner picture on top of its page"). */
export async function copyBannerPicture(popupId: string) {
  const p = await prisma.popup.findFirst({ where: { id: popupId, deletedAt: null }, select: { image: true, mimeType: true, width: true, height: true } });
  if (!p || !p.image || p.image.length === 0) throw new ApiError(404, "That banner's picture was not found.");
  const row = await prisma.customPageImage.create({ data: { image: p.image, mimeType: p.mimeType, width: p.width, height: p.height }, select: { id: true, width: true, height: true } });
  return { id: row.id, imageUrl: imageUrl(row.id), width: row.width, height: row.height };
}

export async function uploadPageImage(input: { imageBase64: string; mimeType: PageImageMimeType; width: number; height: number }) {
  const image = Buffer.from(input.imageBase64, "base64");
  if (image.length === 0) throw new ApiError(400, "The picture is empty.");
  if (image.length > MAX_PAGE_IMAGE_BYTES) throw new ApiError(400, "The picture is too large (max 3 MB).");
  const row = await prisma.customPageImage.create({ data: { image, mimeType: input.mimeType, width: input.width, height: input.height }, select: { id: true, width: true, height: true } });
  return { id: row.id, imageUrl: imageUrl(row.id), width: row.width, height: row.height };
}

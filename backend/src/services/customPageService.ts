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
 *  - "DOWNLOAD": the app download (website only; popups and slides).
 * Apps ignore targets they don't know (an app older than 1.0.133 shows such a button without opening anything).
 */

export const PAGE_TARGET_PREFIX = "page:";
export const TARGET_RE = /^([A-Za-z0-9]{1,40}|page:[0-9a-f-]{36})$/;
export const PAGE_IMAGE_MIME_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type PageImageMimeType = (typeof PAGE_IMAGE_MIME_TYPES)[number];
/** Decoded picture size cap; the panel shrinks uploads (1080 px wide) well under this. */
export const MAX_PAGE_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_BLOCKS = 40;

const target = z.string().trim().regex(TARGET_RE, "Pick what it opens.");
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
  }),
  z.object({ type: z.literal("button"), label: z.string().trim().min(1, "A button has no text.").max(30), target }),
]);
export const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS, `A page can have at most ${MAX_BLOCKS} blocks.`);
export type PageBlock = z.infer<typeof blockSchema>;
/** A block as the apps get it: a picture also carries its URL and size. */
type ShownBlock = Exclude<PageBlock, { type: "image" }> | (Extract<PageBlock, { type: "image" }> & { imageUrl: string; width: number; height: number });

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

/** A shown page, for the app. Buttons that lead to a page that is hidden or gone are left out, pictures then lead nowhere. */
export async function getLivePage(id: string) {
  const row = await prisma.customPage.findFirst({ where: { id, deletedAt: null, active: true } });
  if (!row) throw new ApiError(404, "This page is not available any more.");
  const blocks = await withImages(storedBlocks(row.blocks));
  const linked = blocks.flatMap((b) => (b.type !== "text" ? [pageIdOf(b.target)] : [])).filter((x): x is string => !!x);
  const live = await livePageIds(linked);
  const shown = blocks.flatMap((b): ShownBlock[] => {
    if (b.type === "button") {
      const t = liveTarget(b.target, live);
      return t ? [{ ...b, target: t }] : [];
    }
    if (b.type === "image") return [{ ...b, target: liveTarget(b.target, live) }];
    return [b];
  });
  return { id: row.id, title: row.title, updatedAt: row.updatedAt, blocks: shown };
}

export async function getPageImage(id: string) {
  const row = await prisma.customPageImage.findUnique({ where: { id }, select: { image: true, mimeType: true } });
  if (!row) throw new ApiError(404, "Picture not found");
  return row;
}

// ---------- the admin's side ----------

export async function listPages() {
  const rows = await prisma.customPage.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  return Promise.all(rows.map(async (r) => ({ id: r.id, title: r.title, active: r.active, createdAt: r.createdAt, updatedAt: r.updatedAt, blocks: await withImages(storedBlocks(r.blocks)) })));
}

/** Every picture must have been uploaded, and every page a block opens must exist (not deleted). */
async function checkBlocks(blocks: PageBlock[]) {
  const imageIds = [...new Set(blocks.flatMap((b) => (b.type === "image" ? [b.imageId] : [])))];
  if (imageIds.length) {
    const found = await prisma.customPageImage.count({ where: { id: { in: imageIds } } });
    if (found !== imageIds.length) throw new ApiError(400, "A picture on the page was not found. Upload it again.");
  }
  const pageIds = [...new Set(blocks.flatMap((b) => (b.type !== "text" ? [pageIdOf(b.target)] : [])).filter((x): x is string => !!x))];
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

export async function createPage(input: { title: string; blocks: PageBlock[] }) {
  await checkBlocks(input.blocks);
  const row = await prisma.customPage.create({ data: { title: input.title, blocks: input.blocks } });
  return { id: row.id };
}

export async function updatePage(id: string, input: { title?: string; blocks?: PageBlock[]; active?: boolean }) {
  const found = await prisma.customPage.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Page not found");
  if (input.blocks) await checkBlocks(input.blocks);
  await prisma.customPage.update({ where: { id }, data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.blocks ? { blocks: input.blocks } : {}), ...(input.active !== undefined ? { active: input.active } : {}) } });
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

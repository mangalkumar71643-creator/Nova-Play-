import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { getAppDownloadUrl } from "./settingsService";

export const POPUP_MIME_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type PopupMimeType = (typeof POPUP_MIME_TYPES)[number];
/** Decoded image size cap; the panel shrinks uploads well under this. */
export const MAX_POPUP_IMAGE_BYTES = 2 * 1024 * 1024;
/** POPUP: shown on app open. SLIDER: auto-sliding banner at the top of Home. CATEGORY_SLIDER: auto-sliding banner at the top of the game category screen. */
export const POPUP_KINDS = ["POPUP", "SLIDER", "CATEGORY_SLIDER"] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];
/** A slider button target that downloads the app instead of opening a game. */
export const DOWNLOAD_TARGET = "DOWNLOAD";

const listSelect = { id: true, title: true, mimeType: true, width: true, height: true, sortOrder: true, active: true, kind: true, buttonText: true, buttonTarget: true, createdAt: true, updatedAt: true } as const;

type PopupRow = { id: string; updatedAt: Date };

/** Versioned by updatedAt, so a replaced image gets a new URL and caches can keep the old one forever. */
function imagePath(row: PopupRow) {
  return `/popups/${row.id}/image?v=${row.updatedAt.getTime()}`;
}

function decodeImage(base64: string): Buffer {
  const image = Buffer.from(base64, "base64");
  if (image.length === 0) throw new ApiError(400, "Image is empty.");
  if (image.length > MAX_POPUP_IMAGE_BYTES) throw new ApiError(400, "Image is too large (max 2 MB).");
  return image;
}

/** What the app shows, in order. "Download app" buttons carry the download link. */
export async function listLivePopups(kind: PopupKind = "POPUP") {
  const rows = await prisma.popup.findMany({ where: { deletedAt: null, active: true, kind }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: listSelect });
  const downloadUrl = rows.some((r) => r.buttonTarget === DOWNLOAD_TARGET) ? await getAppDownloadUrl() : null;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    width: r.width,
    height: r.height,
    imageUrl: imagePath(r),
    buttonText: r.buttonText,
    buttonTarget: r.buttonTarget,
    buttonUrl: r.buttonTarget === DOWNLOAD_TARGET ? downloadUrl : null,
  }));
}

export async function getPopupImage(id: string) {
  const row = await prisma.popup.findFirst({ where: { id, deletedAt: null }, select: { image: true, mimeType: true } });
  if (!row) throw new ApiError(404, "Popup not found");
  return row;
}

/** Everything the panel manages, active or not. */
export async function listAllPopups() {
  const rows = await prisma.popup.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: listSelect });
  return rows.map((r) => ({ ...r, imageUrl: imagePath(r) }));
}

/** New popups go to the end of their kind's order. */
type PopupButton = { buttonText?: string | null; buttonTarget?: string | null };

export async function createPopup(input: { title: string; imageBase64: string; mimeType: PopupMimeType; width: number; height: number; kind: PopupKind } & PopupButton) {
  const image = decodeImage(input.imageBase64);
  const last = await prisma.popup.aggregate({ where: { deletedAt: null, kind: input.kind }, _max: { sortOrder: true } });
  const row = await prisma.popup.create({
    data: {
      title: input.title,
      image,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      kind: input.kind,
      buttonText: input.buttonText || null,
      buttonTarget: input.buttonTarget || null,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: listSelect,
  });
  return { ...row, imageUrl: imagePath(row) };
}

export async function updatePopup(id: string, input: { title?: string; active?: boolean } & PopupButton) {
  const found = await prisma.popup.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Popup not found");
  const row = await prisma.popup.update({ where: { id }, data: input, select: listSelect });
  return { ...row, imageUrl: imagePath(row) };
}

/** Sets the order of one kind to exactly the given ids, first shown first. */
export async function reorderPopups(ids: string[], kind: PopupKind) {
  const live = await prisma.popup.findMany({ where: { deletedAt: null, kind }, select: { id: true } });
  const liveIds = new Set(live.map((r) => r.id));
  if (ids.length !== liveIds.size || new Set(ids).size !== ids.length || ids.some((id) => !liveIds.has(id))) {
    throw new ApiError(409, "The popup list changed — reload and try again.");
  }
  await prisma.$transaction(ids.map((id, i) => prisma.popup.update({ where: { id }, data: { sortOrder: i } })));
  return listAllPopups();
}

export async function deletePopup(id: string) {
  const found = await prisma.popup.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new ApiError(404, "Popup not found");
  await prisma.popup.update({ where: { id }, data: { deletedAt: new Date(), active: false, image: Buffer.alloc(0) } });
}

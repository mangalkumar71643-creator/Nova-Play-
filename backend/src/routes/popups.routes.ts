import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getPopupImage, listLivePopups, POPUP_KINDS, type PopupKind } from "../services/popupService";

// Public: the app fetches these before the player is necessarily logged in.
const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    // ?kind=SLIDER for the Home banner, ?kind=CATEGORY_SLIDER for the category screen; no kind keeps older apps on app-open popups.
    const kind = POPUP_KINDS.includes(req.query.kind as PopupKind) ? (req.query.kind as PopupKind) : "POPUP";
    res.json(await listLivePopups(kind));
  })
);

router.get(
  "/:id/image",
  asyncHandler(async (req, res) => {
    const { image, mimeType } = await getPopupImage(req.params.id);
    res.setHeader("Content-Type", mimeType);
    // The URL carries ?v=<updatedAt>, so a given URL's bytes never change.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(image));
  })
);

export default router;

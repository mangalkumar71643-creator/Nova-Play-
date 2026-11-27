import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getLivePage, getPageImage } from "../services/customPageService";

// Public: the app opens custom pages (Admin → Pages) from banners and popups, logged in or not.
const router = Router();

router.get(
  "/images/:id",
  asyncHandler(async (req, res) => {
    const { image, mimeType } = await getPageImage(req.params.id);
    res.setHeader("Content-Type", mimeType);
    // A picture is never changed once uploaded (a new one gets a new id), so its URL can be kept forever.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(image));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // ?v=2: the app draws pictures with words on them (1.0.137+); older apps get them as a picture, text and a button
    res.json(await getLivePage(req.params.id, { v: Number(req.query.v) || 1 }));
  })
);

export default router;

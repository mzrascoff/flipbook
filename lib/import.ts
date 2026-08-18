import { decodePhoto, makePreviewJpeg } from "./decode";
import { readCaptureTime } from "./exif";
import type { Photo } from "./types";

/** Long edge of the working copy used for preview playback and alignment. */
const PREVIEW_EDGE = 900;

/**
 * Long edge of the strip/series thumbnails. The strip renders them 96px tall,
 * so 240 covers a 2x display with room to spare at ~0.15 MB decoded each —
 * against ~2.4 MB for a decoded preview.
 */
const THUMB_EDGE = 240;

/**
 * The most photos a session will hold. Each one costs bookkeeping for as long
 * as the tab lives, and imports transiently decode at full resolution — an
 * uncapped import is how iOS Safari runs out of memory and silently reloads
 * the tab. The strip's thumbnails decode lazily, so the resident cost is
 * bounded by the viewport rather than the count, which is what makes a cap
 * this size workable on a phone.
 */
export const MAX_PHOTOS = 200;

let counter = 0;

export type ImportProgress = { done: number; total: number; name: string };

export type ImportOutcome = {
  photos: Photo[];
  skipped: { name: string; reason: string }[];
};

function isImage(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|hei[cf]|webp|gif|tiff?|avif)$/i.test(file.name)
  );
}

/**
 * Reads a batch of photos into working state: capture time, real dimensions,
 * and two downscaled JPEGs per photo — a small thumbnail the UI retains, and a
 * preview-sized copy that is only decoded on demand (see lib/previewCache.ts).
 *
 * Nothing decoded is retained here. A decoded image stays resident for as long
 * as JavaScript holds a strong reference to it — the browser cannot evict it —
 * so holding one preview-sized element per photo is ~2.4 MB each, and a large
 * import is exactly when that gets a mobile tab killed. Full-resolution pixels
 * are only ever decoded one photo at a time, here and during export.
 *
 * `limit` bounds how many photos this import may add (the caller passes what
 * is left under MAX_PHOTOS); files beyond it are reported as skipped.
 */
export async function importPhotos(
  files: File[],
  limit: number,
  onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportOutcome> {
  const photos: Photo[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const images = files.filter(isImage);
  const candidates = images.slice(0, Math.max(0, limit));

  for (const [index, file] of candidates.entries()) {
    signal?.throwIfAborted();
    onProgress?.({ done: index, total: candidates.length, name: file.name });

    try {
      const [{ takenAt, fromExif }, bitmap] = await Promise.all([
        readCaptureTime(file),
        decodePhoto(file),
      ]);

      let previewUrl: string;
      let thumbUrl: string;
      let width: number;
      let height: number;
      try {
        width = bitmap.width;
        height = bitmap.height;
        previewUrl = URL.createObjectURL(
          await makePreviewJpeg(bitmap, PREVIEW_EDGE),
        );
        thumbUrl = URL.createObjectURL(
          await makePreviewJpeg(bitmap, THUMB_EDGE),
        );
      } finally {
        bitmap.close();
      }

      photos.push({
        id: `p${Date.now().toString(36)}${(counter++).toString(36)}`,
        file,
        takenAt,
        fromExif,
        width,
        height,
        previewUrl,
        thumbUrl,
      });
    } catch (error) {
      skipped.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "Could not be read",
      });
    }
  }

  onProgress?.({
    done: candidates.length,
    total: candidates.length,
    name: "",
  });

  for (const file of images.slice(candidates.length)) {
    skipped.push({ name: file.name, reason: `Over the ${MAX_PHOTOS}-photo limit` });
  }
  for (const file of files) {
    if (!isImage(file)) skipped.push({ name: file.name, reason: "Not an image" });
  }

  return { photos, skipped };
}

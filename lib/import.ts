import { decodePhoto, loadImageElement, makePreviewJpeg } from "./decode";
import { readCaptureTime } from "./exif";
import type { Photo } from "./types";

/** Long edge of the working copy used for thumbnails, preview and alignment. */
const PREVIEW_EDGE = 900;

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
 * and one downscaled JPEG per photo.
 *
 * The downscaled copy is what the strip and the preview draw, so the browser
 * manages that memory and can evict it. Full-resolution pixels are only ever
 * decoded during export, one photo at a time.
 */
export async function importPhotos(
  files: File[],
  onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportOutcome> {
  const photos: Photo[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const candidates = files.filter(isImage);

  for (const [index, file] of candidates.entries()) {
    signal?.throwIfAborted();
    onProgress?.({ done: index, total: candidates.length, name: file.name });

    try {
      const [{ takenAt, fromExif }, bitmap] = await Promise.all([
        readCaptureTime(file),
        decodePhoto(file),
      ]);

      let previewUrl: string;
      let width: number;
      let height: number;
      try {
        width = bitmap.width;
        height = bitmap.height;
        previewUrl = URL.createObjectURL(
          await makePreviewJpeg(bitmap, PREVIEW_EDGE),
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
        previewImg: await loadImageElement(previewUrl),
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

  for (const file of files) {
    if (!isImage(file)) skipped.push({ name: file.name, reason: "Not an image" });
  }

  return { photos, skipped };
}

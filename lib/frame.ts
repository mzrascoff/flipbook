import type { Photo } from "./types";

export type FrameSize = { width: number; height: number };

/** A source rectangle in normalized (0–1) coordinates. */
export type SourceRect = { x: number; y: number; w: number; h: number };

export const FULL_FRAME: SourceRect = { x: 0, y: 0, w: 1, h: 1 };

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Picks the video's frame size.
 *
 * A video has one fixed size, so a mixed set has to settle on something. The
 * most common aspect ratio wins, which means an all-portrait series fills the
 * frame edge to edge with no padding at all, and only the odd shot out gets
 * white on its sides. Within that aspect we take the largest photo's
 * dimensions, then cap the long edge so the encode stays sane.
 */
export function computeFrameSize(
  photos: Photo[],
  maxLongEdge: number,
  crop: SourceRect = FULL_FRAME,
): FrameSize {
  if (photos.length === 0) return { width: 2, height: 2 };

  const buckets = new Map<string, Photo[]>();
  for (const photo of photos) {
    const aspect = (photo.width * crop.w) / (photo.height * crop.h);
    const key = aspect.toFixed(2);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(photo);
    else buckets.set(key, [photo]);
  }

  let winner: Photo[] = [];
  let winnerArea = 0;
  for (const bucket of buckets.values()) {
    const area = Math.max(...bucket.map((p) => p.width * p.height));
    if (
      bucket.length > winner.length ||
      (bucket.length === winner.length && area > winnerArea)
    ) {
      winner = bucket;
      winnerArea = area;
    }
  }

  const widest = winner.reduce((a, b) =>
    a.width * a.height > b.width * b.height ? a : b,
  );
  let width = widest.width * crop.w;
  let height = widest.height * crop.h;

  const longEdge = Math.max(width, height);
  if (longEdge > maxLongEdge) {
    const scale = maxLongEdge / longEdge;
    width *= scale;
    height *= scale;
  }

  return { width: even(width), height: even(height) };
}

/**
 * Draws one photo as one frame: white paper, photo fit whole and centered.
 * Nothing is cropped here — `src` is only ever narrowed by auto-align, which
 * the user has to turn on deliberately.
 */
export function drawPhotoFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  frame: FrameSize,
  src: SourceRect = FULL_FRAME,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, frame.width, frame.height);

  const sx = src.x * sourceWidth;
  const sy = src.y * sourceHeight;
  const sw = src.w * sourceWidth;
  const sh = src.h * sourceHeight;
  if (sw <= 0 || sh <= 0) return;

  const scale = Math.min(frame.width / sw, frame.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (frame.width - dw) / 2;
  const dy = (frame.height - dh) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * True when at least one photo will sit on white rather than filling the frame.
 * Compares the aspect of what actually gets drawn, so an aligned set — where
 * every photo is narrowed by the same crop — is not reported as padded.
 */
export function needsPadding(
  photos: Photo[],
  frame: FrameSize,
  crop: SourceRect = FULL_FRAME,
) {
  const frameAspect = frame.width / frame.height;
  return photos.some(
    (photo) =>
      Math.abs(
        (photo.width * crop.w) / (photo.height * crop.h) - frameAspect,
      ) > 0.01,
  );
}

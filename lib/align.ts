import type { Photo } from "./types";
import { FULL_FRAME, type SourceRect } from "./frame";

/**
 * Optional registration for handheld series.
 *
 * This estimates translation only — no rotation, no scale, no warping. It
 * finds how far each photo drifted from the one before it, then crops every
 * photo to the rectangle they all share. That crop is why it ships turned off:
 * it is the one operation in the app that discards pixels.
 */

/** Drift of a photo relative to the first one, as a fraction of its size. */
export type Offset = { dx: number; dy: number };

const COARSE_WIDTH = 48;
const FINE_WIDTH = 160;
const COARSE_RADIUS = 6;
const FINE_RADIUS = 4;
/** Sample every Nth pixel when scoring — plenty for a translation estimate. */
const STRIDE = 2;

type Gray = { data: Uint8Array; w: number; h: number };

function toGray(
  img: ImageBitmap,
  w: number,
  h: number,
  canvas: HTMLCanvasElement,
): Gray {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.drawImage(img, 0, 0, w, h);
  const { data: rgba } = ctx.getImageData(0, 0, w, h);
  const data = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  }
  return { data, w, h };
}

/** Mean absolute difference where `b` is `a` shifted by (ox, oy). */
function score(a: Gray, b: Gray, ox: number, oy: number): number {
  const x0 = Math.max(0, -ox);
  const x1 = Math.min(a.w, a.w - ox);
  const y0 = Math.max(0, -oy);
  const y1 = Math.min(a.h, a.h - oy);
  if (x1 - x0 < a.w / 3 || y1 - y0 < a.h / 3) return Number.POSITIVE_INFINITY;

  let total = 0;
  let count = 0;
  for (let y = y0; y < y1; y += STRIDE) {
    const aRow = y * a.w;
    const bRow = (y + oy) * b.w + ox;
    for (let x = x0; x < x1; x += STRIDE) {
      total += Math.abs(a.data[aRow + x] - b.data[bRow + x]);
      count++;
    }
  }
  return count === 0 ? Number.POSITIVE_INFINITY : total / count;
}

function bestShift(
  a: Gray,
  b: Gray,
  centerX: number,
  centerY: number,
  radius: number,
) {
  let best = { ox: centerX, oy: centerY, cost: Number.POSITIVE_INFINITY };
  for (let oy = centerY - radius; oy <= centerY + radius; oy++) {
    for (let ox = centerX - radius; ox <= centerX + radius; ox++) {
      const cost = score(a, b, ox, oy);
      if (cost < best.cost) best = { ox, oy, cost };
    }
  }
  return best;
}

/**
 * Measures each photo's drift relative to the first, accumulating pairwise
 * estimates so gradual movement across a long series is tracked correctly.
 */
export async function estimateOffsets(
  photos: Photo[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Offset[]> {
  const offsets: Offset[] = [{ dx: 0, dy: 0 }];
  if (photos.length < 2) return offsets;

  const aspect = photos[0].width / photos[0].height;
  const coarseH = Math.max(8, Math.round(COARSE_WIDTH / aspect));
  const fineH = Math.max(24, Math.round(FINE_WIDTH / aspect));
  const canvas = document.createElement("canvas");

  /* Decode one preview at a time and close it as soon as its grayscale grids
     are read — the grids are tiny, and this never holds more than one decoded
     preview no matter how long the series is. */
  const grays = async (photo: Photo): Promise<[Gray, Gray]> => {
    const blob = await fetch(photo.previewUrl).then((r) => r.blob());
    const bitmap = await createImageBitmap(blob);
    try {
      return [
        toGray(bitmap, COARSE_WIDTH, coarseH, canvas),
        toGray(bitmap, FINE_WIDTH, fineH, canvas),
      ];
    } finally {
      bitmap.close();
    }
  };

  let [prevCoarse, prevFine] = await grays(photos[0]);

  for (let i = 1; i < photos.length; i++) {
    signal?.throwIfAborted();
    const [coarse, fine] = await grays(photos[i]);

    const rough = bestShift(prevCoarse, coarse, 0, 0, COARSE_RADIUS);
    const ratio = FINE_WIDTH / COARSE_WIDTH;
    const refined = bestShift(
      prevFine,
      fine,
      Math.round(rough.ox * ratio),
      Math.round(rough.oy * ratio),
      FINE_RADIUS,
    );

    const previous = offsets[i - 1];
    offsets.push({
      dx: previous.dx + refined.ox / FINE_WIDTH,
      dy: previous.dy + refined.oy / fineH,
    });

    prevCoarse = coarse;
    prevFine = fine;
    onProgress?.(i, photos.length - 1);
    // Yield so a long series does not lock up the tab.
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return offsets;
}

/**
 * The rectangle present in every photo once drift is accounted for.
 *
 * Returns `null` when registering the series would cost more than a third of
 * the picture in either direction — the caller must then abandon alignment
 * entirely, offsets included. Returning the full frame here instead would be a
 * trap: the offsets would still get applied against an unshrunk window, sliding
 * every photo partly off the frame.
 */
export function commonCrop(offsets: Offset[]): SourceRect | null {
  const dxs = offsets.map((o) => o.dx);
  const dys = offsets.map((o) => o.dy);
  const x0 = Math.max(0, -Math.min(...dxs));
  const x1 = Math.min(1, 1 - Math.max(...dxs));
  const y0 = Math.max(0, -Math.min(...dys));
  const y1 = Math.min(1, 1 - Math.max(...dys));

  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 0.66 || h < 0.66) return null;
  // A steady series measures as the full frame, and is therefore never cropped.
  if (w > 0.999 && h > 0.999) return FULL_FRAME;
  return { x: x0, y: y0, w, h };
}

/** The crop window as it falls on one particular photo. */
export function cropForOffset(crop: SourceRect, offset: Offset): SourceRect {
  return {
    x: crop.x + offset.dx,
    y: crop.y + offset.dy,
    w: crop.w,
    h: crop.h,
  };
}

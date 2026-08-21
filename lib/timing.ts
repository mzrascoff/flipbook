import type { Settings } from "./types";

/**
 * The whole "old film" feeling lives in this file. No pixels are touched
 * anywhere in it — a flipbook is just photographs held on screen a beat each,
 * cut hard to the next one.
 */

/** One photograph, held for `units` beats. */
export type Beat = { photoIndex: number; units: number };

/**
 * We never write a genuine 5 fps MP4. Players — iOS Photos, iMessage, most
 * social apps — handle very low frame rates badly, so we encode at a normal
 * rate and repeat each photograph for several identical frames instead. The
 * result looks exactly the same (a hard cut every 200 ms at 5 fps) and the
 * duplicates cost almost nothing, since H.264 codes them as empty P-frames.
 *
 * `repeat` is chosen so the container rate lands at 24 fps or above while the
 * displayed rate stays exactly what the user asked for.
 */
export function encodeRate(fps: number) {
  const repeat = Math.max(1, Math.ceil(24 / fps));
  return { repeat, containerFps: fps * repeat };
}

/** Expands photo order into the beats that will be shown, in order. */
export function buildBeats(count: number, settings: Settings): Beat[] {
  if (count === 0) return [];

  let order = Array.from({ length: count }, (_, i) => i);
  if (settings.boomerang && count > 2) {
    order = order.concat(order.slice(1, -1).reverse());
  }

  const beats: Beat[] = [];
  for (let loop = 0; loop < Math.max(1, settings.loops); loop++) {
    for (const photoIndex of order) beats.push({ photoIndex, units: 1 });
  }

  if (settings.holdEnds && beats.length > 1) {
    beats[0] = { ...beats[0], units: 2 };
    beats[beats.length - 1] = { ...beats[beats.length - 1], units: 2 };
  }

  return beats;
}

export function beatUnits(beats: Beat[]) {
  return beats.reduce((sum, beat) => sum + beat.units, 0);
}

/** Runtime of the finished video, in seconds. */
export function totalDuration(beats: Beat[], fps: number) {
  return beatUnits(beats) / fps;
}

/** How many frames the encoder will actually be handed. */
export function totalEncodedFrames(beats: Beat[], fps: number) {
  return beatUnits(beats) * encodeRate(fps).repeat;
}

/**
 * Hard ceiling so a huge set cannot start an encode that never finishes.
 * Sized so a full MAX_PHOTOS import exports at the slowest speed: 200 photos
 * at 2 photos per second, with the default end holds, is (200 + 2) × 12
 * repeats = 2424 frames. The two caps must not contradict each other.
 */
export const MAX_ENCODED_FRAMES = 2500;

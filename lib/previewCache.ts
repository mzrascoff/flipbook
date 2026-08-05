import type { Photo } from "./types";

/**
 * A small, bounded pool of decoded preview images.
 *
 * The preview canvas needs a drawable at preview resolution, but only for the
 * beat it is currently showing. Holding one per photo for the life of the
 * session is what a forty-photo import cannot afford: at 900px on the long
 * edge a 4:3 photo decodes to about 2.4 MB, and a decoded image stays resident
 * for as long as JavaScript holds a strong reference to it.
 *
 * So we keep a handful, evict the least recently used, and lean on the fact
 * that playback is sequential to decode the next few beats before they are
 * needed. Decoding one 900px JPEG takes single-digit milliseconds, so a miss
 * costs one repeated frame rather than a visible stall.
 */

/** How many decoded previews to hold. Six is ~15 MB, and covers a miss or two. */
const CAPACITY = 6;

/** How far ahead of the current beat to decode. */
export const PREFETCH_AHEAD = 2;

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();

/** Map order is insertion order, so re-inserting is a move-to-most-recent. */
function touch(id: string, img: HTMLImageElement) {
  cache.delete(id);
  cache.set(id, img);
  while (cache.size > CAPACITY) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** The decoded preview for this photo, if it happens to be resident. */
export function peek(photo: Photo): HTMLImageElement | null {
  const img = cache.get(photo.id);
  if (!img) return null;
  touch(photo.id, img);
  return img;
}

/**
 * Decodes a photo's preview, or joins the decode already in flight for it.
 * Resolves to null if the image cannot be decoded, so a single unreadable
 * preview cannot break playback of the rest of the series.
 */
export function load(photo: Photo): Promise<HTMLImageElement | null> {
  const resident = peek(photo);
  if (resident) return Promise.resolve(resident);

  const inFlight = pending.get(photo.id);
  if (inFlight) return inFlight;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = photo.previewUrl;
  })
    .then((img) => {
      if (img) touch(photo.id, img);
      return img;
    })
    .finally(() => {
      pending.delete(photo.id);
    });

  pending.set(photo.id, promise);
  return promise;
}

/**
 * Warms upcoming photos. Fire and forget: nothing awaits this, and a photo
 * that fails to decode here simply gets retried when its beat arrives.
 */
export function prefetch(photos: (Photo | undefined)[]) {
  for (const photo of photos) {
    if (photo) void load(photo);
  }
}

/** Drops photos that no longer exist, so their decoded pixels can go too. */
export function forget(ids: Iterable<string>) {
  for (const id of ids) {
    cache.delete(id);
    pending.delete(id);
  }
}

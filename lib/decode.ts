/**
 * Turning iPhone photo files into pixels, in the browser.
 *
 * Two things bite here. First, `createImageBitmap` ignores EXIF orientation
 * unless you ask for it, so photos taken sideways come out sideways. Second,
 * HEIC only decodes natively in Safari — Chrome, Firefox and Edge still have no
 * HEVC licence, so they need a wasm decoder, which we load only if we hit one.
 */

let heicConverter: ((file: Blob) => Promise<Blob>) | null = null;

async function getHeicConverter() {
  if (!heicConverter) {
    const { heicTo } = await import("heic-to");
    heicConverter = (blob: Blob) =>
      heicTo({ blob, type: "image/jpeg", quality: 0.95 });
  }
  return heicConverter;
}

function looksLikeHeic(file: File) {
  return (
    /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
  );
}

/**
 * Decodes a photo at full resolution with EXIF orientation applied, falling
 * back to a wasm HEIC decoder when the browser cannot read the file itself.
 *
 * The caller owns the returned bitmap and should `close()` it when done —
 * a 12 MP bitmap is ~48 MB, so holding several is how you crash a phone.
 */
export async function decodePhoto(file: File): Promise<ImageBitmap> {
  const options: ImageBitmapOptions = { imageOrientation: "from-image" };

  if (!looksLikeHeic(file)) {
    try {
      return await createImageBitmap(file, options);
    } catch {
      // Fall through — some browsers mislabel or refuse odd JPEG variants.
    }
  }

  try {
    return await createImageBitmap(file, options);
  } catch {
    const convert = await getHeicConverter();
    const jpeg = await convert(file);
    return createImageBitmap(jpeg, options);
  }
}

/**
 * Renders a bitmap down to a JPEG no larger than `maxEdge` on its long side.
 * Used for thumbnails and preview playback so the browser, not us, decides
 * when to evict decoded pixels.
 */
export async function makePreviewJpeg(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality = 0.85,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not encode the preview image");
  return blob;
}

/** Waits for an object URL to be decoded into a drawable image element. */
export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the preview image"));
    img.src = url;
  });
}

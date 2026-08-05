export type CaptureTime = { takenAt: number; fromExif: boolean };

/**
 * Loaded on demand. exifr ships a universal build that probes for Node's `fs`
 * and `zlib`, which it should not be doing inside a prerender, and it is only
 * ever needed once the user has actually chosen photos.
 */
let parser: typeof import("exifr").default | null = null;

async function getParser() {
  if (!parser) parser = (await import("exifr")).default;
  return parser;
}

/**
 * Reads the moment a photo was taken. EXIF DateTimeOriginal is what we want —
 * it survives copying and syncing, unlike the filesystem timestamp, which is
 * what an AirDrop or an iCloud download leaves behind.
 */
export async function readCaptureTime(file: File): Promise<CaptureTime> {
  try {
    const exifr = await getParser();
    const tags = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });
    const stamp: unknown =
      tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.ModifyDate;
    if (stamp instanceof Date && !Number.isNaN(stamp.getTime())) {
      return { takenAt: stamp.getTime(), fromExif: true };
    }
  } catch {
    // HEIC without a parsable header, a stripped file, a screenshot — all fine.
  }
  return { takenAt: file.lastModified, fromExif: false };
}

import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";

import type { EncodeResult } from "./encode";
import type { FlipbookMeta } from "./types";

/**
 * Getting the video off the phone.
 *
 * On iOS a plain download lands in Files, not Photos, which is not where anyone
 * wants their flipbook. The share sheet does have "Save Video", so that is the
 * primary path on mobile and the download is the fallback.
 */

export function canShareFiles(blob: Blob, filename: string) {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File([blob], filename, { type: blob.type })],
    });
  } catch {
    return false;
  }
}

export async function shareVideo(
  blob: Blob,
  filename: string,
  title: string,
): Promise<"shared" | "cancelled" | "unsupported"> {
  const file = new File([blob], filename, { type: blob.type });
  if (!canShareFiles(blob, filename)) return "unsupported";
  try {
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    return "unsupported";
  }
}

export function downloadVideo(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give Safari a moment to start the download before the URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Uploads only the finished video and its first frame — never the source
 * photos. The 16-character id is the whole access control: unguessable, but
 * anyone holding the link can watch it.
 */
export async function saveFlipbook(
  result: EncodeResult,
  title: string,
  onProgress?: (percentage: number) => void,
): Promise<{ id: string; url: string }> {
  const id = nanoid(16);

  const video = await upload(`flipbooks/${id}/video.${result.ext}`, result.blob, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    contentType: result.contentType,
    onUploadProgress: ({ percentage }) => onProgress?.(percentage),
  });

  const poster = await upload(`flipbooks/${id}/poster.jpg`, result.posterBlob, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    contentType: "image/jpeg",
  });

  const meta: FlipbookMeta = {
    id,
    title: title.trim() || "Flipbook",
    fps: result.fps,
    frames: result.frames,
    width: result.width,
    height: result.height,
    duration: result.duration,
    ext: result.ext,
    contentType: result.contentType,
    videoUrl: video.url,
    posterUrl: poster.url,
    createdAt: new Date().toISOString(),
  };

  const response = await fetch("/api/flipbooks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!response.ok) {
    throw new Error(`Could not save the flipbook (${response.status})`);
  }

  return { id, url: `/f/${id}` };
}

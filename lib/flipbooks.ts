import { list } from "@vercel/blob";

import type { FlipbookMeta } from "./types";

const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

/**
 * Looks up a saved flipbook by id. There is no database — the metadata record
 * sits next to the video in Blob storage, so we list the one prefix and read it.
 */
export async function getFlipbook(id: string): Promise<FlipbookMeta | null> {
  if (!ID_PATTERN.test(id)) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const { blobs } = await list({ prefix: `flipbooks/${id}/`, limit: 10 });
    const record = blobs.find((blob) => blob.pathname.endsWith("/meta.json"));
    if (!record) return null;

    const response = await fetch(record.url, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    return (await response.json()) as FlipbookMeta;
  } catch {
    return null;
  }
}

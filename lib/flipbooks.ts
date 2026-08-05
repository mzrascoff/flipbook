import { BlobNotFoundError, head } from "@vercel/blob";
import { cache } from "react";

import type { FlipbookMeta } from "./types";

const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

/**
 * Looks up a saved flipbook by id. There is no database — the metadata record
 * sits next to the video in Blob storage at a fully determined path, so this is
 * one `head` and one cached read rather than a listing.
 *
 * Wrapped in React's `cache` because both `generateMetadata` and the page body
 * ask for the same record while rendering one request.
 *
 * Returns `null` only when the flipbook genuinely is not there. A transient
 * failure — expired token, Blob 5xx, timeout — throws instead of pretending the
 * record is missing: this route is ISR, so a `notFound()` gets cached, and one
 * blip would otherwise pin a perfectly good flipbook as a 404 for an hour.
 */
export const getFlipbook = cache(
  async (id: string): Promise<FlipbookMeta | null> => {
    if (!ID_PATTERN.test(id)) return null;
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

    const pathname = `flipbooks/${id}/meta.json`;

    let url: string;
    try {
      ({ url } = await head(pathname));
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }

    // meta.json is written once and never overwritten, so it can be held
    // indefinitely rather than re-fetched on a timer.
    const response = await fetch(url, { cache: "force-cache" });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Could not read that flipbook (${response.status})`);
    }
    return (await response.json()) as FlipbookMeta;
  },
);

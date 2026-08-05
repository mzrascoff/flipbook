import { head, put } from "@vercel/blob";
import { NextResponse } from "next/server";

import type { FlipbookMeta } from "@/lib/types";

const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const CONTENT_TYPES = new Set(["video/mp4", "video/webm"]);

function isValid(meta: Partial<FlipbookMeta>): meta is FlipbookMeta {
  return (
    typeof meta.id === "string" &&
    ID_PATTERN.test(meta.id) &&
    typeof meta.title === "string" &&
    meta.title.length <= 120 &&
    typeof meta.videoUrl === "string" &&
    typeof meta.posterUrl === "string" &&
    typeof meta.contentType === "string" &&
    CONTENT_TYPES.has(meta.contentType) &&
    (meta.ext === "mp4" || meta.ext === "webm") &&
    Number.isFinite(meta.fps) &&
    Number.isFinite(meta.frames) &&
    Number.isFinite(meta.width) &&
    Number.isFinite(meta.height) &&
    Number.isFinite(meta.duration)
  );
}

/**
 * Confirms a URL really points at the expected object inside this project's own
 * Blob store. Both the video and the poster go through this: the poster ends up
 * as the OpenGraph image on a page served from our domain, so letting a caller
 * name an arbitrary URL would turn every link unfurl into a request to theirs.
 */
async function belongsToStore(url: string, expectedPath: string) {
  try {
    const info = await head(url);
    return info.pathname === expectedPath;
  } catch {
    return false;
  }
}

/**
 * Whether shareable links are available at all. Saving needs a Blob store
 * connected to the project; without one the app hides the option rather than
 * letting the upload fail with an SDK error nobody can act on.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}

/**
 * Writes the small metadata record that makes a saved flipbook shareable.
 * There is no database — the record lives next to the video in Blob storage.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: Partial<FlipbookMeta>;
  try {
    payload = (await request.json()) as Partial<FlipbookMeta>;
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  if (!isValid(payload)) {
    return NextResponse.json({ error: "Invalid flipbook" }, { status: 400 });
  }

  // Both files must already be in our own store under this id, or the record we
  // publish could point anywhere.
  const [videoOk, posterOk] = await Promise.all([
    belongsToStore(payload.videoUrl, `flipbooks/${payload.id}/video.${payload.ext}`),
    belongsToStore(payload.posterUrl, `flipbooks/${payload.id}/poster.jpg`),
  ]);
  if (!videoOk || !posterOk) {
    return NextResponse.json(
      { error: "Those files are not in this store" },
      { status: 400 },
    );
  }

  const meta: FlipbookMeta = { ...payload, createdAt: new Date().toISOString() };

  try {
    await put(`flipbooks/${meta.id}/meta.json`, JSON.stringify(meta), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: meta.id, url: `/f/${meta.id}` });
}

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * Issues short-lived tokens so the browser can upload straight to Blob storage.
 *
 * Only the finished video and its poster frame ever come through here — the
 * source photos never leave the device. Anyone can create a flipbook, by
 * design; the unguessable path is what keeps a saved one private.
 *
 * That design makes this a public write endpoint, so the token it mints is
 * scoped as narrowly as the upload actually needs: the exact pathname shape,
 * and a size and content type derived from which of the two files is being
 * written. A poster frame has no business being 200 MB, or a video.
 */

/** The two files a flipbook is allowed to consist of. */
const UPLOAD_RULES = [
  {
    pattern: /^flipbooks\/[A-Za-z0-9_-]{16}\/video\.(mp4|webm)$/,
    contentTypes: ["video/mp4", "video/webm"],
    /** Generous next to a real export (single-digit MB), mean next to abuse. */
    maxBytes: 48 * 1024 * 1024,
  },
  {
    pattern: /^flipbooks\/[A-Za-z0-9_-]{16}\/poster\.jpg$/,
    contentTypes: ["image/jpeg"],
    maxBytes: 3 * 1024 * 1024,
  },
];
export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "No Blob store is connected to this project" },
      { status: 501 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const rule = UPLOAD_RULES.find((r) => r.pattern.test(pathname));
        if (!rule) throw new Error("That is not a path this app writes to");
        return {
          allowedContentTypes: rule.contentTypes,
          addRandomSuffix: false,
          maximumSizeInBytes: rule.maxBytes,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        };
      },
      onUploadCompleted: async () => {
        // Nothing to do — the metadata record is written by /api/flipbooks.
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

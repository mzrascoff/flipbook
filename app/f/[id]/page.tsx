import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getFlipbook } from "@/lib/flipbooks";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps<"/f/[id]">): Promise<Metadata> {
  const { id } = await params;
  const flipbook = await getFlipbook(id);
  if (!flipbook) return { title: "Flipbook not found" };

  const description = `${flipbook.frames} frames at ${flipbook.fps} photos per second.`;
  return {
    title: `${flipbook.title} — Flipbook`,
    description,
    openGraph: {
      title: flipbook.title,
      description,
      type: "video.other",
      images: [{ url: flipbook.posterUrl, width: flipbook.width, height: flipbook.height }],
      videos: [
        {
          url: flipbook.videoUrl,
          type: flipbook.contentType,
          width: flipbook.width,
          height: flipbook.height,
        },
      ],
    },
    twitter: { card: "player", title: flipbook.title, description },
  };
}

export default async function FlipbookPage({ params }: PageProps<"/f/[id]">) {
  const { id } = await params;
  const flipbook = await getFlipbook(id);
  if (!flipbook) notFound();

  const seconds = flipbook.duration.toFixed(1).replace(/\.0$/, "");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">{flipbook.title}</h1>
        <p className="text-sm text-neutral-500">
          {flipbook.frames} frames · {flipbook.fps} photos per second · {seconds}s
        </p>
      </header>

      <video
        className="w-full rounded-xl bg-white shadow-sm ring-1 ring-black/10"
        src={flipbook.videoUrl}
        poster={flipbook.posterUrl}
        controls
        loop
        playsInline
        preload="metadata"
        width={flipbook.width}
        height={flipbook.height}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a
          className="rounded-full bg-neutral-900 px-4 py-2 font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          href={flipbook.videoUrl}
          download={`${flipbook.title.replace(/[^\w -]+/g, "") || "flipbook"}.${flipbook.ext}`}
        >
          Download
        </a>
        <Link
          className="rounded-full px-4 py-2 font-medium ring-1 ring-black/15 transition hover:bg-black/5 dark:ring-white/20 dark:hover:bg-white/10"
          href="/"
        >
          Make your own
        </Link>
      </div>

      <p className="mt-auto text-xs leading-relaxed text-neutral-500">
        Made from photographs, held one beat each. Nothing was added, filtered,
        or invented.
      </p>
    </main>
  );
}

"use client";

import type { Photo, Series } from "@/lib/types";

type Props = {
  series: Series[];
  photos: Map<string, Photo>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onMergeUp: (id: string) => void;
  onDelete: (id: string) => void;
};

/**
 * The series we found by capture time. Everything here is editable, because
 * clustering is a guess — a burst and a second attempt a minute later might
 * belong together, or might not.
 */
export default function SeriesList({
  series,
  photos,
  activeId,
  onSelect,
  onRename,
  onMergeUp,
  onDelete,
}: Props) {
  if (series.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" data-testid="series-list">
      {series.map((item, index) => {
        const active = item.id === activeId;
        const cover = photos.get(item.photoIds[0]);
        return (
          <li key={item.id}>
            <div
              className={[
                "flex items-center gap-3 rounded-xl p-2 pr-3 transition",
                active
                  ? "bg-neutral-900/[0.06] ring-1 ring-neutral-900/20 dark:bg-white/10 dark:ring-white/25"
                  : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-label={`Show ${item.title}`}
                data-testid="series-button"
                className="shrink-0"
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover.thumbUrl}
                    alt=""
                    className="size-11 rounded-lg bg-white object-cover ring-1 ring-black/10"
                  />
                ) : (
                  <span className="block size-11 rounded-lg bg-black/5 dark:bg-white/10" />
                )}
              </button>

              <span className="flex min-w-0 flex-1 flex-col">
                <input
                  aria-label={`Name of ${item.title}`}
                  value={item.title}
                  onChange={(event) => onRename(item.id, event.target.value)}
                  onFocus={() => onSelect(item.id)}
                  data-testid="series-title"
                  className="w-full min-w-0 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium outline-none transition hover:border-black/10 focus:border-black/25 focus:bg-white dark:hover:border-white/15 dark:focus:border-white/30 dark:focus:bg-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="px-1 text-left text-xs text-neutral-500"
                >
                  {item.photoIds.length}{" "}
                  {item.photoIds.length === 1 ? "photo" : "photos"}
                </button>
              </span>

              {index > 0 && (
                <button
                  type="button"
                  onClick={() => onMergeUp(item.id)}
                  title="Join with the series above"
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 ring-1 ring-black/10 transition hover:bg-black/5 dark:ring-white/15 dark:hover:bg-white/10"
                >
                  join up
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label={`Remove ${item.title}`}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 transition hover:text-red-600"
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

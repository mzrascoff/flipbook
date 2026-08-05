import type { Photo, Series } from "./types";

/** Default gap, in seconds, that separates one series from the next. */
export const DEFAULT_GAP_SECONDS = 10;

let counter = 0;
function seriesId() {
  return `s${Date.now().toString(36)}${(counter++).toString(36)}`;
}

/**
 * Splits photos into series wherever the gap between consecutive captures
 * exceeds `gapSeconds`. Bursts and repeated attempts at the same shot fall
 * within a few seconds of each other, so they cluster on their own.
 */
export function groupByCaptureTime(
  photos: Photo[],
  gapSeconds = DEFAULT_GAP_SECONDS,
): Series[] {
  const sorted = [...photos].sort((a, b) => a.takenAt - b.takenAt);
  const groups: Photo[][] = [];

  for (const photo of sorted) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (previous && photo.takenAt - previous.takenAt <= gapSeconds * 1000) {
      current.push(photo);
    } else {
      groups.push([photo]);
    }
  }

  return groups.map((group, index) => ({
    id: seriesId(),
    title: seriesTitle(group, index),
    photoIds: group.map((p) => p.id),
  }));
}

function seriesTitle(group: Photo[], index: number) {
  const first = group[0];
  if (!first.fromExif) return `Series ${index + 1}`;
  const when = new Date(first.takenAt);
  return when.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function newSeries(title: string, photoIds: string[]): Series {
  return { id: seriesId(), title, photoIds };
}

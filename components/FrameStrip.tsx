"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { memo, useCallback, useMemo } from "react";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Photo } from "@/lib/types";

type Props = {
  photos: Photo[];
  currentIndex: number;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onSplit: (index: number) => void;
};

/**
 * The frames of one series, in order. Dragging uses a dedicated grip so the
 * strip still scrolls under a thumb, and the nudge buttons cover the cases
 * where dragging on a phone is more trouble than it is worth.
 */
export default function FrameStrip({
  photos,
  currentIndex,
  onReorder,
  onRemove,
  onSplit,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* Stable identities so the memoized frames below actually stay put. The
     highlight moves several times a second during playback, and re-running a
     useSortable hook per photo at that rate is real work on a phone. The ids
     array matters most: SortableContext keys its context value on the items
     array's identity, and a fresh array per render would re-render every
     sortable frame each beat regardless of memo. */
  const ids = useMemo(() => photos.map((p) => p.id), [photos]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }

  const move = useCallback(
    (index: number, delta: number) => {
      const to = index + delta;
      if (to < 0 || to >= photos.length) return;
      onReorder(arrayMove(photos.map((p) => p.id), index, to));
    },
    [photos, onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <ol
          className="flex snap-x gap-3 overflow-x-auto pb-2"
          data-testid="frame-strip"
        >
          {photos.map((photo, index) => (
            <Frame
              key={photo.id}
              photo={photo}
              index={index}
              count={photos.length}
              active={index === currentIndex}
              onRemove={onRemove}
              onSplit={onSplit}
              onMove={move}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

const Frame = memo(function Frame({
  photo,
  index,
  count,
  active,
  onRemove,
  onSplit,
  onMove,
}: {
  photo: Photo;
  index: number;
  count: number;
  active: boolean;
  onRemove: (id: string) => void;
  onSplit: (index: number) => void;
  onMove: (index: number, delta: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={[
        "group relative shrink-0 snap-start rounded-lg bg-white p-1 ring-1 transition",
        active ? "ring-2 ring-neutral-900 dark:ring-white" : "ring-black/10",
        isDragging ? "z-10 opacity-90 shadow-lg" : "",
      ].join(" ")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumbUrl}
        alt={`Frame ${index + 1}`}
        // Lazy: with imports of up to MAX_PHOTOS the strip would otherwise
        // hold every decoded thumbnail at once, which is real memory on a
        // phone. The reserved aspect ratio is what makes lazy actually lazy:
        // an unsized image is ~zero pixels wide, so the whole strip would sit
        // inside the lazy-load margin and load in one burst — and each late
        // load would shift the layout under an in-progress drag.
        loading="lazy"
        decoding="async"
        style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        className="h-24 w-auto max-w-40 rounded object-contain"
        draggable={false}
      />

      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
        {index + 1}
      </span>

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag frame ${index + 1}`}
        className="absolute right-2 top-2 cursor-grab touch-none rounded bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-white"
      >
        ⠿
      </button>

      {/* Always visible: on a phone there is no hover to reveal them with. */}
      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded bg-black/60 px-1 py-0.5">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={`Move frame ${index + 1} earlier`}
          className="px-1 text-xs text-white disabled:opacity-30"
        >
          ◀
        </button>
        {index > 0 && (
          <button
            type="button"
            onClick={() => onSplit(index)}
            title="Start a new series here"
            className="px-1 text-[10px] text-white"
          >
            split
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(photo.id)}
          aria-label={`Remove frame ${index + 1}`}
          className="px-1 text-xs text-white"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === count - 1}
          aria-label={`Move frame ${index + 1} later`}
          className="px-1 text-xs text-white disabled:opacity-30"
        >
          ▶
        </button>
      </div>
    </li>
  );
});

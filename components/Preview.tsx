"use client";

import { useEffect, useMemo, useRef } from "react";

import { cropForOffset } from "@/lib/align";
import type { Alignment } from "@/lib/encode";
import { computeFrameSize, drawPhotoFrame } from "@/lib/frame";
import { buildBeats } from "@/lib/timing";
import type { Photo, Settings } from "@/lib/types";

/** Long edge of the preview canvas. Small enough to stay smooth on a phone. */
const PREVIEW_EDGE = 900;

type Props = {
  photos: Photo[];
  settings: Settings;
  alignment: Alignment | null;
  playing: boolean;
  onFrame: (photoIndex: number) => void;
};

/**
 * Plays the series exactly as the export will: hard cuts, one photo per beat,
 * white paper behind anything that does not fill the frame. No encoding
 * happens here, so the speed slider responds instantly.
 */
export default function Preview({
  photos,
  settings,
  alignment,
  playing,
  onFrame,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const useAlignment =
    settings.align && alignment?.offsets.length === photos.length
      ? alignment
      : null;

  const frame = useMemo(
    () => computeFrameSize(photos, PREVIEW_EDGE, useAlignment?.crop),
    [photos, useAlignment],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || photos.length === 0) return;

    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const beats = buildBeats(photos.length, settings);
    if (beats.length === 0) return;

    // Cumulative end time of each beat, so a rAF tick is a simple lookup.
    const ends: number[] = [];
    let clock = 0;
    for (const beat of beats) {
      clock += beat.units / settings.fps;
      ends.push(clock);
    }
    const cycle = clock;

    const draw = (beatIndex: number) => {
      const beat = beats[beatIndex];
      const photo = photos[beat.photoIndex];
      if (!photo) return;
      drawPhotoFrame(
        ctx,
        photo.previewImg,
        photo.previewImg.naturalWidth,
        photo.previewImg.naturalHeight,
        frame,
        useAlignment
          ? cropForOffset(useAlignment.crop, useAlignment.offsets[beat.photoIndex])
          : undefined,
      );
      onFrame(beat.photoIndex);
    };

    draw(0);
    if (!playing || beats.length < 2) return;

    let raf = 0;
    let start = performance.now();
    let shown = 0;

    const tick = (now: number) => {
      let elapsed = (now - start) / 1000;
      if (elapsed >= cycle) {
        start = now;
        elapsed = 0;
      }
      let index = ends.findIndex((end) => elapsed < end);
      if (index === -1) index = beats.length - 1;
      if (index !== shown) {
        shown = index;
        draw(index);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [photos, settings, useAlignment, playing, frame, onFrame]);

  if (photos.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="preview-canvas"
      className="mx-auto max-h-[52vh] w-auto max-w-full rounded-xl bg-white shadow-sm ring-1 ring-black/10"
      style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
    />
  );
}

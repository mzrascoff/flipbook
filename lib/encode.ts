import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from "mediabunny";

import { commonCrop, cropForOffset, estimateOffsets, type Offset } from "./align";
import { decodePhoto } from "./decode";
import {
  FULL_FRAME,
  computeFrameSize,
  drawPhotoFrame,
  type SourceRect,
} from "./frame";
import {
  MAX_ENCODED_FRAMES,
  buildBeats,
  encodeRate,
  totalDuration,
  totalEncodedFrames,
} from "./timing";
import type { Photo, Settings } from "./types";

export type EncodeStage = "aligning" | "encoding" | "finishing";

/** Where each photo sits once drift is measured, plus the rectangle they share. */
export type Alignment = {
  offsets: Offset[];
  crop: SourceRect;
  /** True when the series moved too much to register, so nothing was applied. */
  gaveUp: boolean;
};

export const NO_ALIGNMENT = (count: number, gaveUp = false): Alignment => ({
  offsets: Array.from({ length: count }, () => ({ dx: 0, dy: 0 })),
  crop: FULL_FRAME,
  gaveUp,
});

/** Measures handheld drift across a series. Safe to run ahead of encoding. */
export async function computeAlignment(
  photos: Photo[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Alignment> {
  if (photos.length < 2) return NO_ALIGNMENT(photos.length);
  const offsets = await estimateOffsets(photos, onProgress, signal);
  const crop = commonCrop(offsets);
  // Abandoning alignment means abandoning the offsets too, not just the crop.
  if (!crop) return NO_ALIGNMENT(photos.length, true);
  return { offsets, crop, gaveUp: false };
}

export type EncodeProgress = {
  stage: EncodeStage;
  done: number;
  total: number;
};

export type EncodeResult = {
  blob: Blob;
  contentType: string;
  ext: string;
  width: number;
  height: number;
  duration: number;
  frames: number;
  /** Photos per second as displayed, not the container frame rate. */
  fps: number;
  codec: VideoCodec;
  posterBlob: Blob;
};

/** Codecs we will accept, best first. AVC is the one iOS will happily replay. */
const CODEC_PREFERENCE: VideoCodec[] = ["avc", "vp9", "vp8"];

/** Roughly 0.1 bits per pixel per frame — generous for photographic stills. */
function bitrateFor(width: number, height: number, fps: number) {
  const target = width * height * Math.max(fps, 6) * 0.12;
  return Math.round(Math.min(24e6, Math.max(2e6, target)));
}

export async function pickCodec(width: number, height: number, fps: number) {
  return getFirstEncodableVideoCodec(CODEC_PREFERENCE, {
    width,
    height,
    quality: new Quality({ bitrate: bitrateFor(width, height, fps) }),
  });
}

export class TooManyFramesError extends Error {
  constructor(readonly frames: number) {
    super(
      `That comes to ${frames} frames, past the ${MAX_ENCODED_FRAMES} limit. Use fewer photos, a faster speed, or fewer loops.`,
    );
    this.name = "TooManyFramesError";
  }
}

export class NoEncoderError extends Error {
  constructor() {
    super("This browser cannot encode video. Try Safari or Chrome.");
    this.name = "NoEncoderError";
  }
}

/**
 * Builds the video. Photos are decoded one at a time at full resolution and
 * released immediately, which is what keeps a phone from running out of memory
 * partway through a forty-photo series.
 */
export async function encodeFlipbook(
  photos: Photo[],
  settings: Settings,
  options: {
    onProgress?: (progress: EncodeProgress) => void;
    signal?: AbortSignal;
    /** Pass the alignment the preview already measured to avoid redoing it. */
    alignment?: Alignment;
  } = {},
): Promise<EncodeResult> {
  const { onProgress, signal } = options;
  if (photos.length === 0) throw new Error("No photos to work with");

  const beats = buildBeats(photos.length, settings);
  const frames = totalEncodedFrames(beats, settings.fps);
  if (frames > MAX_ENCODED_FRAMES) throw new TooManyFramesError(frames);

  let alignment = NO_ALIGNMENT(photos.length);
  if (settings.align && photos.length > 1) {
    if (options.alignment?.offsets.length === photos.length) {
      alignment = options.alignment;
    } else {
      onProgress?.({ stage: "aligning", done: 0, total: photos.length - 1 });
      alignment = await computeAlignment(
        photos,
        (done, total) => onProgress?.({ stage: "aligning", done, total }),
        signal,
      );
    }
  }
  const { offsets, crop } = alignment;

  const frame = computeFrameSize(photos, settings.maxLongEdge, crop);
  const codec = await pickCodec(frame.width, frame.height, settings.fps);
  if (!codec) throw new NoEncoderError();

  const isMp4 = codec === "avc";
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get a 2D canvas context");

  const output = new Output({
    format: isMp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });

  const { repeat, containerFps } = encodeRate(settings.fps);
  const source = new CanvasSource(canvas, {
    codec,
    quality: new Quality({
      bitrate: bitrateFor(frame.width, frame.height, settings.fps),
    }),
    keyFrameInterval: 1,
  });
  output.addVideoTrack(source, { frameRate: containerFps });
  await output.start();

  let posterBlob: Blob | null = null;
  let frameIndex = 0;

  try {
    for (let b = 0; b < beats.length; b++) {
      signal?.throwIfAborted();
      const beat = beats[b];
      const photo = photos[beat.photoIndex];

      const bitmap = await decodePhoto(photo.file);
      try {
        drawPhotoFrame(
          ctx,
          bitmap,
          bitmap.width,
          bitmap.height,
          frame,
          cropForOffset(crop, offsets[beat.photoIndex]),
        );
      } finally {
        bitmap.close();
      }

      if (!posterBlob) posterBlob = await canvasToJpeg(canvas);

      for (let r = 0; r < beat.units * repeat; r++) {
        await source.add(frameIndex / containerFps, 1 / containerFps);
        frameIndex++;
        onProgress?.({ stage: "encoding", done: frameIndex, total: frames });
      }
    }

    onProgress?.({ stage: "finishing", done: frames, total: frames });
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("The encoder produced no data");

  /* Constructing the Blob copies the bytes, which makes this the third copy of
     the finished file in memory: BufferTarget's working buffer, the exact-size
     slice it exposes as `.buffer`, and now the Blob. Only the Blob leaves this
     function, so detach the slice immediately instead of waiting for the
     collector — a 2160px export is tens of MB per copy. The working buffer
     dies with `output` when this returns. */
  const blob = new Blob([buffer as BlobPart], { type: output.format.mimeType });
  (buffer as ArrayBuffer & { transfer?(length?: number): ArrayBuffer }).transfer?.(0);

  const poster = posterBlob ?? (await canvasToJpeg(canvas));

  // Hand the frame canvas' backing store back before returning. Re-exporting a
  // few times at 2160px would otherwise leave a pile of them for the collector.
  canvas.width = 0;
  canvas.height = 0;

  return {
    blob,
    contentType: output.format.mimeType,
    ext: isMp4 ? "mp4" : "webm",
    width: frame.width,
    height: frame.height,
    duration: totalDuration(beats, settings.fps),
    frames: frameIndex,
    fps: settings.fps,
    codec,
    posterBlob: poster,
  };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not make a poster image")),
      "image/jpeg",
      0.9,
    );
  });
}

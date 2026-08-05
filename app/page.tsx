"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Controls from "@/components/Controls";
import Dropzone from "@/components/Dropzone";
import ExportPanel from "@/components/ExportPanel";
import FrameStrip from "@/components/FrameStrip";
import Preview from "@/components/Preview";
import SeriesList from "@/components/SeriesList";
import {
  NoEncoderError,
  TooManyFramesError,
  computeAlignment,
  encodeFlipbook,
  pickCodec,
  type Alignment,
  type EncodeProgress,
  type EncodeResult,
} from "@/lib/encode";
import { computeFrameSize, needsPadding } from "@/lib/frame";
import { groupByCaptureTime, newSeries } from "@/lib/group";
import { importPhotos, type ImportProgress } from "@/lib/import";
import {
  DEFAULT_SETTINGS,
  type Photo,
  type Series,
  type Settings,
} from "@/lib/types";

const SIZE_OPTIONS = [720, 1080, 1440, 2160];

export default function Studio() {
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [series, setSeries] = useState<Series[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [playing, setPlaying] = useState(true);
  const [currentPhoto, setCurrentPhoto] = useState(0);

  const [importing, setImporting] = useState<ImportProgress | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);

  /* Alignment is cached against the exact frame order it was measured for. */
  const [measured, setMeasured] = useState<{
    key: string;
    alignment: Alignment;
  } | null>(null);
  const [alignProgress, setAlignProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const [busy, setBusy] = useState<EncodeProgress | null>(null);
  const [result, setResult] = useState<{
    encoded: EncodeResult;
    url: string;
    key: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sizeOptions, setSizeOptions] = useState<number[]>([720, 1080]);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const liveUrl = useRef<string | null>(null);
  const exports = useRef(0);

  /**
   * The finished video's object URL is created here, in an event handler, and
   * revoked here. Tying it to an effect would have StrictMode's second mount
   * revoke a URL that the render had already handed to the <video> element.
   */
  const publishResult = useCallback((encoded: EncodeResult | null) => {
    if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    if (!encoded) {
      liveUrl.current = null;
      setResult(null);
      return;
    }
    const url = URL.createObjectURL(encoded.blob);
    liveUrl.current = url;
    exports.current += 1;
    setResult({ encoded, url, key: exports.current });
  }, []);

  const clearResult = useCallback(() => publishResult(null), [publishResult]);

  useEffect(
    () => () => {
      if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    },
    [],
  );

  const active = series.find((item) => item.id === activeId) ?? null;
  const activePhotos = useMemo(
    () =>
      (active?.photoIds ?? [])
        .map((id) => photos.get(id))
        .filter((photo): photo is Photo => Boolean(photo)),
    [active, photos],
  );

  /* Offer only the export sizes this device can actually encode. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported: number[] = [];
      for (const size of SIZE_OPTIONS) {
        const codec = await pickCodec(size, size, 30);
        if (codec) supported.push(size);
      }
      if (!cancelled && supported.length > 0) setSizeOptions(supported);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Shareable links need a Blob store; find out before offering the button. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/flipbooks")
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setSaveEnabled(Boolean(data.enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const alignKey = useMemo(
    () => activePhotos.map((photo) => photo.id).join(","),
    [activePhotos],
  );
  const alignment =
    settings.align && measured?.key === alignKey ? measured.alignment : null;
  const aligning =
    settings.align && activePhotos.length > 1 && !alignment
      ? (alignProgress ?? { done: 0, total: activePhotos.length - 1 })
      : null;

  /* Measure drift only when the user asks for alignment. */
  useEffect(() => {
    if (!settings.align || activePhotos.length < 2) return;
    if (measured?.key === alignKey) return;

    const controller = new AbortController();
    computeAlignment(
      activePhotos,
      (done, total) => {
        if (!controller.signal.aborted) setAlignProgress({ done, total });
      },
      controller.signal,
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setMeasured({ key: alignKey, alignment: next });
        setAlignProgress(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAlignProgress(null);
      });
    return () => controller.abort();
  }, [settings.align, activePhotos, alignKey, measured?.key]);

  const addFiles = useCallback(async (files: File[]) => {
    setError(null);
    setImporting({ done: 0, total: files.length, name: "" });
    try {
      const outcome = await importPhotos(files, setImporting);
      setSkipped(outcome.skipped);
      if (outcome.photos.length === 0) {
        if (outcome.skipped.length > 0) {
          setError("None of those files could be read as photos.");
        }
        return;
      }

      setPhotos((previous) => {
        const next = new Map(previous);
        for (const photo of outcome.photos) next.set(photo.id, photo);
        return next;
      });
      const groups = groupByCaptureTime(outcome.photos);
      setSeries((previous) => [...previous, ...groups]);
      setActiveId((previous) => previous ?? groups[0]?.id ?? null);
      clearResult();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not read those photos",
      );
    } finally {
      setImporting(null);
    }
  }, [clearResult]);

  function patchSeries(id: string, patch: Partial<Series>) {
    setSeries((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    clearResult();
  }

  function forgetPhotos(ids: string[]) {
    setPhotos((previous) => {
      const next = new Map(previous);
      for (const id of ids) {
        const photo = next.get(id);
        if (photo) URL.revokeObjectURL(photo.previewUrl);
        next.delete(id);
      }
      return next;
    });
  }

  function removePhoto(photoId: string) {
    if (!active) return;
    const remaining = active.photoIds.filter((id) => id !== photoId);
    if (remaining.length === 0) {
      deleteSeries(active.id);
      return;
    }
    patchSeries(active.id, { photoIds: remaining });
    forgetPhotos([photoId]);
  }

  function deleteSeries(id: string) {
    const target = series.find((item) => item.id === id);
    forgetPhotos(target?.photoIds ?? []);
    setSeries((previous) => {
      const remaining = previous.filter((item) => item.id !== id);
      setActiveId((current) =>
        current === id ? (remaining[0]?.id ?? null) : current,
      );
      return remaining;
    });
    clearResult();
  }

  function mergeUp(id: string) {
    setSeries((previous) => {
      const index = previous.findIndex((item) => item.id === id);
      if (index <= 0) return previous;
      const merged: Series = {
        ...previous[index - 1],
        photoIds: [
          ...previous[index - 1].photoIds,
          ...previous[index].photoIds,
        ],
      };
      const next = [...previous];
      next.splice(index - 1, 2, merged);
      setActiveId(merged.id);
      return next;
    });
    clearResult();
  }

  function splitAt(index: number) {
    if (!active || index <= 0) return;
    setSeries((previous) => {
      const at = previous.findIndex((item) => item.id === active.id);
      if (at === -1) return previous;
      const head = {
        ...previous[at],
        photoIds: active.photoIds.slice(0, index),
      };
      const tail = newSeries(`${active.title} (2)`, active.photoIds.slice(index));
      const next = [...previous];
      next.splice(at, 1, head, tail);
      return next;
    });
    clearResult();
  }

  async function exportVideo() {
    if (activePhotos.length === 0) return;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    clearResult();
    setBusy({ stage: "encoding", done: 0, total: 1 });
    setPlaying(false);
    try {
      const next = await encodeFlipbook(activePhotos, settings, {
        onProgress: setBusy,
        signal: controller.signal,
        alignment: settings.align ? (alignment ?? undefined) : undefined,
      });
      publishResult(next);
    } catch (encodeError) {
      if (controller.signal.aborted) {
        setError(null);
      } else if (
        encodeError instanceof TooManyFramesError ||
        encodeError instanceof NoEncoderError
      ) {
        setError(encodeError.message);
      } else {
        setError(
          encodeError instanceof Error
            ? encodeError.message
            : "Something went wrong making the video",
        );
      }
    } finally {
      setBusy(null);
      abort.current = null;
    }
  }

  const exportCrop = settings.align ? alignment?.crop : undefined;
  const exportFrame = useMemo(
    () => computeFrameSize(activePhotos, settings.maxLongEdge, exportCrop),
    [activePhotos, settings.maxLongEdge, exportCrop],
  );
  const padded = needsPadding(activePhotos, exportFrame, exportCrop);
  const cropPercent =
    settings.align && alignment
      ? Math.round((1 - Math.min(alignment.crop.w, alignment.crop.h)) * 100)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Flipbook</h1>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-500">
          Photos you shot as a series, played back slowly enough that you can
          still see they were photographs. Nothing is filtered, retouched, or
          invented — each one is just held a beat and cut hard to the next.
        </p>
      </header>

      {photos.size === 0 ? (
        <Dropzone onFiles={addFiles} busy={Boolean(importing)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:grid-rows-[auto_1fr] lg:gap-8">
          <aside className="lg:col-start-1 lg:row-start-1">
            <SeriesList
              series={series}
              photos={photos}
              activeId={activeId}
              onSelect={setActiveId}
              onRename={(id, title) => patchSeries(id, { title })}
              onMergeUp={mergeUp}
              onDelete={deleteSeries}
            />
          </aside>

          {/* Last on a phone, so the preview is the first thing you see. */}
          <div className="order-last lg:order-none lg:col-start-1 lg:row-start-2">
            <Dropzone
              onFiles={addFiles}
              busy={Boolean(importing)}
              compact
              label="Add more photos"
            />
          </div>

          <section className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <Preview
              photos={activePhotos}
              settings={settings}
              alignment={alignment}
              playing={playing && !busy}
              onFrame={setCurrentPhoto}
            />

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
                data-testid="play-toggle"
                className="rounded-full px-4 py-2 font-medium ring-1 ring-black/15 transition hover:bg-black/5 dark:ring-white/20 dark:hover:bg-white/10"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <span className="text-xs text-neutral-500" data-testid="frame-info">
                {activePhotos.length}{" "}
                {activePhotos.length === 1 ? "photo" : "photos"} ·{" "}
                {exportFrame.width}×{exportFrame.height}
                {padded &&
                  " · white padding on photos that do not fill the frame"}
              </span>
            </div>

            {activePhotos.length > 0 && (
              <FrameStrip
                photos={activePhotos}
                currentIndex={currentPhoto}
                onReorder={(ids) =>
                  active && patchSeries(active.id, { photoIds: ids })
                }
                onRemove={removePhoto}
                onSplit={splitAt}
              />
            )}

            <Controls
              settings={settings}
              photoCount={activePhotos.length}
              maxSizeOptions={sizeOptions}
              aligning={aligning}
              alignCropped={cropPercent}
              onChange={(patch) => {
                setSettings((previous) => ({ ...previous, ...patch }));
                clearResult();
              }}
            />

            <ExportPanel
              title={active?.title ?? "Flipbook"}
              photoCount={activePhotos.length}
              busy={busy}
              result={result?.encoded ?? null}
              resultUrl={result?.url ?? null}
              resultKey={result?.key ?? 0}
              saveEnabled={saveEnabled}
              error={error}
              onExport={exportVideo}
              onCancel={() => abort.current?.abort()}
            />
          </section>
        </div>
      )}

      {importing && (
        <p className="text-xs text-neutral-500" role="status">
          Reading {Math.min(importing.done + 1, importing.total)} of{" "}
          {importing.total}
          {importing.name && ` — ${importing.name}`}
        </p>
      )}

      {skipped.length > 0 && (
        <p className="text-xs text-neutral-500">
          Skipped {skipped.length}:{" "}
          {skipped.map((item) => `${item.name} (${item.reason})`).join(", ")}
        </p>
      )}
    </main>
  );
}

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
import { MAX_PHOTOS, importPhotos, type ImportProgress } from "@/lib/import";
import { forget as forgetPreviews } from "@/lib/previewCache";
import {
  DEFAULT_SETTINGS,
  type Photo,
  type Series,
  type Settings,
} from "@/lib/types";
import { useLicense } from "@/lib/useLicense";

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
  /* Progress and failure are both keyed too, so a previous series' count or
     error can never be shown against the current one. */
  const [alignProgress, setAlignProgress] = useState<{
    key: string;
    done: number;
    total: number;
  } | null>(null);
  const [alignFailure, setAlignFailure] = useState<{
    key: string;
    message: string;
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
  const gate = useLicense();
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

  /**
   * Throws away a finished video and any stale error together. Every change
   * that could invalidate an export routes through here, so the panel can never
   * show one series' video under another series' name.
   */
  const clearResult = useCallback(() => {
    publishResult(null);
    setError(null);
  }, [publishResult]);

  /** Moving to another series invalidates the export and resumes playback. */
  const selectSeries = useCallback(
    (id: string) => {
      setActiveId(id);
      clearResult();
      setPlaying(true);
    },
    [clearResult],
  );

  useEffect(
    () => () => {
      if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    },
    [],
  );

  const active = series.find((item) => item.id === activeId) ?? null;
  // Keyed on the photo ids, not the Series object: renaming replaces the object
  // and would otherwise tear down and restart preview playback per keystroke.
  const activeIds = active?.photoIds;
  const activePhotos = useMemo(
    () =>
      (activeIds ?? [])
        .map((id) => photos.get(id))
        .filter((photo): photo is Photo => Boolean(photo)),
    [activeIds, photos],
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
  const alignFailed =
    settings.align && alignFailure?.key === alignKey ? alignFailure.message : null;
  const aligning =
    settings.align && activePhotos.length > 1 && !alignment && !alignFailed
      ? (alignProgress?.key === alignKey
          ? { done: alignProgress.done, total: alignProgress.total }
          : { done: 0, total: activePhotos.length - 1 })
      : null;

  /* Measure drift only when the user asks for alignment. */
  useEffect(() => {
    if (!settings.align || activePhotos.length < 2) return;
    if (measured?.key === alignKey) return;
    if (alignFailure?.key === alignKey) return;

    const controller = new AbortController();
    computeAlignment(
      activePhotos,
      (done, total) => {
        if (!controller.signal.aborted) {
          setAlignProgress({ key: alignKey, done, total });
        }
      },
      controller.signal,
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setMeasured({ key: alignKey, alignment: next });
        setAlignProgress(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Without recording the failure, `aligning` stays true forever and the
        // "Measuring drift…" line hangs at its last count with nothing said.
        setAlignFailure({
          key: alignKey,
          message:
            error instanceof Error
              ? error.message
              : "Could not measure how much these moved",
        });
        setAlignProgress(null);
      });
    return () => controller.abort();
  }, [settings.align, activePhotos, alignKey, measured?.key, alignFailure?.key]);

  const addFiles = useCallback(async (files: File[]) => {
    setError(null);
    const room = MAX_PHOTOS - photos.size;
    if (room <= 0) {
      setError(
        `This session already holds ${MAX_PHOTOS} photos — the most a phone can comfortably keep open. Remove some photos or reload to start fresh.`,
      );
      return;
    }
    setImporting({ done: 0, total: files.length, name: "" });
    try {
      const outcome = await importPhotos(files, room, setImporting);
      setSkipped(outcome.skipped);

      /* One or two oddballs belong in the footer list, but when most of a
         batch is skipped for one reason, that reason is the headline. Set
         after clearResult below, which wipes the error along with the video. */
      let headline: string | null = null;
      if (outcome.skipped.length >= 3) {
        const counts = new Map<string, number>();
        for (const item of outcome.skipped) {
          counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
        }
        const [reason, count] = [...counts.entries()].sort(
          (a, b) => b[1] - a[1],
        )[0];
        if (count >= 3) {
          headline = `Skipped ${count} of ${files.length} photos — ${reason.replace(/\.$/, "")}.`;
        }
      }

      if (outcome.photos.length === 0) {
        setError(
          headline ??
            (outcome.skipped.length > 0
              ? "None of those files could be read as photos."
              : null),
        );
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
      if (headline) setError(headline);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not read those photos",
      );
    } finally {
      setImporting(null);
    }
  }, [clearResult, photos.size]);

  function patchSeries(id: string, patch: Partial<Series>) {
    setSeries((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    // A rename only changes the download filename, so it must not throw away a
    // video someone just waited for. Changing which photos are in the series does.
    if (patch.photoIds) clearResult();
  }

  function forgetPhotos(ids: string[]) {
    forgetPreviews(ids);
    setPhotos((previous) => {
      const next = new Map(previous);
      for (const id of ids) {
        const photo = next.get(id);
        if (photo) {
          URL.revokeObjectURL(photo.previewUrl);
          URL.revokeObjectURL(photo.thumbUrl);
        }
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
    if (activePhotos.length === 0 || !gate.allowed) return;
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
      gate.recordExport();
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

  /* Three distinct outcomes: it worked, it was already steady, or the series
     moved too much to register. Zero percent cropped meant two of those. */
  const alignOutcome: "cropped" | "steady" | "gave-up" | "failed" | null =
    alignFailed
      ? "failed"
      : !(settings.align && alignment)
        ? null
        : alignment.gaveUp
          ? "gave-up"
          : alignment.crop.w > 0.999 && alignment.crop.h > 0.999
            ? "steady"
            : "cropped";
  const cropPercent =
    alignOutcome === "cropped"
      ? Math.round((1 - Math.min(alignment!.crop.w, alignment!.crop.h)) * 100)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Flipbook</h1>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-500">
          Your photos, played as a little film. Nothing invented — each one is
          held a beat and cut hard to the next.
        </p>
      </header>

      {photos.size === 0 ? (
        <>
          {/* The proof is older than the pitch: Muybridge's 1878 gallop was
              the first photo series played fast enough to move. This is his,
              exported by this tool from his eleven photographs. */}
          <figure className="flex flex-col gap-2">
            <video
              src="/muybridge.mp4"
              poster="/muybridge-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              data-testid="sample-video"
              className="mx-auto w-full max-w-2xl rounded-xl bg-white shadow-sm ring-1 ring-black/10"
            />
            <figcaption className="mx-auto text-xs text-neutral-500">
              Eadweard Muybridge&apos;s galloping horse, 1878 — eleven
              photographs, one beat each. The first flipbook, made with this
              one.
            </figcaption>
          </figure>

          <Dropzone onFiles={addFiles} busy={Boolean(importing)} />
          {/* The usual banner lives in the export panel, which only exists
              once photos are in — a first import that entirely fails still
              needs somewhere to say so. */}
          {error && (
            <p
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:grid-rows-[auto_1fr] lg:gap-8">
          <aside className="lg:col-start-1 lg:row-start-1">
            <SeriesList
              series={series}
              photos={photos}
              activeId={activeId}
              onSelect={selectSeries}
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
              alignOutcome={alignOutcome}
              alignFailed={alignFailed}
              alignCropped={cropPercent}
              onChange={(patch) => {
                setSettings((previous) => ({ ...previous, ...patch }));
                clearResult();
              }}
            />

            <ExportPanel
              title={active?.title ?? "Flipbook"}
              photoCount={activePhotos.length}
              gate={gate}
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

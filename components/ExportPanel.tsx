"use client";

import { useState } from "react";

import type { EncodeProgress, EncodeResult } from "@/lib/encode";
import { FREE_EXPORTS } from "@/lib/license";
import {
  canShareFiles,
  downloadVideo,
  saveFlipbook,
  shareVideo,
} from "@/lib/share";
import type { Gate } from "@/lib/useLicense";

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  title: string;
  photoCount: number;
  gate: Gate;
  busy: EncodeProgress | null;
  result: EncodeResult | null;
  /**
   * Object URL for the finished video. Owned by the page, not created here —
   * an object URL tied to an effect gets revoked by StrictMode's double mount.
   */
  resultUrl: string | null;
  /** Bumped on every successful export so the result view starts fresh. */
  resultKey: number;
  /** False when no Blob store is connected, so links cannot be made. */
  saveEnabled: boolean;
  error: string | null;
  onExport: () => void;
  onCancel: () => void;
};

export default function ExportPanel({
  title,
  photoCount,
  gate,
  busy,
  result,
  resultUrl,
  resultKey,
  saveEnabled,
  error,
  onExport,
  onCancel,
}: Props) {
  return (
    <section className="flex flex-col gap-4">
      {!result && gate.allowed && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExport}
            disabled={Boolean(busy) || photoCount === 0}
            data-testid="export-button"
            className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {busy ? "Making it…" : "Make the video"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-neutral-500 underline"
            >
              Cancel
            </button>
          )}
          {!gate.license && !busy && (
            <span className="text-xs text-neutral-500" data-testid="free-meter">
              {gate.freeLeft} of {FREE_EXPORTS} free{" "}
              {gate.freeLeft === 1 ? "video" : "videos"} left
            </span>
          )}
          {gate.license && !busy && (
            <span className="text-xs text-neutral-500" data-testid="license-status">
              Licensed until{" "}
              {new Date(gate.license.exp * 1000).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {!result && !gate.allowed && <Paywall gate={gate} />}

      {busy && (
        <div className="flex flex-col gap-1.5" role="status">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] dark:bg-white"
              style={{
                width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {busy.stage === "aligning" && "Lining the photos up"}
            {busy.stage === "encoding" &&
              `Encoding frame ${busy.done} of ${busy.total}`}
            {busy.stage === "finishing" && "Writing the file"}
          </p>
        </div>
      )}

      {error && (
        <p
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {result && resultUrl && (
        <ResultView
          key={resultKey}
          result={result}
          videoUrl={resultUrl}
          title={title}
          saveEnabled={saveEnabled}
        />
      )}
    </section>
  );
}

/**
 * Shown when the free meter is spent. Same plain voice as the rest of the
 * app: what happened, what it costs, and a way in for people who already paid.
 */
function Paywall({ gate }: { gate: Gate }) {
  const [pasting, setPasting] = useState(false);
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "starting" | "bad-token">(
    "idle",
  );

  async function buy() {
    setState("starting");
    try {
      const response = await fetch("/api/license/checkout", { method: "POST" });
      if (!response.ok) throw new Error();
      const { url } = (await response.json()) as { url: string };
      window.location.href = url;
    } catch {
      setState("idle");
    }
  }

  async function activate() {
    if (await gate.activate(token)) return; // Gate flips; this UI unmounts.
    setState("bad-token");
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-5 dark:bg-white/[0.06]"
      data-testid="paywall"
    >
      <p className="text-sm leading-relaxed">
        Your {FREE_EXPORTS} free videos are made. A year of Flipbook is{" "}
        <strong>$12</strong> — every video you can make, on any device.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={buy}
          disabled={state === "starting"}
          data-testid="buy-button"
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {state === "starting" ? "Opening checkout…" : "Buy a year — $12"}
        </button>
        <button
          type="button"
          onClick={() => setPasting((value) => !value)}
          className="text-sm text-neutral-500 underline"
        >
          Already bought it?
        </button>
      </div>
      {pasting && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              setState("idle");
            }}
            placeholder="Paste your license"
            aria-label="License"
            data-testid="license-input"
            className="min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-xs outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-900 dark:focus:border-white/50"
          />
          <button
            type="button"
            onClick={activate}
            disabled={!token.trim()}
            data-testid="activate-button"
            className="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-black/15 transition hover:bg-black/5 disabled:opacity-50 dark:ring-white/20 dark:hover:bg-white/10"
          >
            Activate
          </button>
          {state === "bad-token" && (
            <p className="w-full text-xs text-red-700 dark:text-red-300" role="alert">
              That license did not check out — it may be mistyped or expired.
              The link in your Stripe receipt email re-issues it.
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        Payment goes through Stripe. Your photos still never leave this device.
      </p>
    </div>
  );
}

function ResultView({
  result,
  videoUrl,
  title,
  saveEnabled,
}: {
  result: EncodeResult;
  videoUrl: string;
  title: string;
  saveEnabled: boolean;
}) {
  const [saveState, setSaveState] = useState<
    | { kind: "idle" }
    | { kind: "saving"; percentage: number }
    | { kind: "saved"; url: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [note, setNote] = useState<string | null>(null);

  const filename = `${title.replace(/[^\w -]+/g, "").trim() || "flipbook"}.${result.ext}`;
  const shareable = canShareFiles(result.blob, filename);

  async function save() {
    setSaveState({ kind: "saving", percentage: 0 });
    try {
      const { url } = await saveFlipbook(result, title, (percentage) =>
        setSaveState({ kind: "saving", percentage }),
      );
      setSaveState({ kind: "saved", url });
    } catch (saveError) {
      setSaveState({
        kind: "error",
        message:
          saveError instanceof Error ? saveError.message : "Could not save it",
      });
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="export-result">
      <video
        src={videoUrl}
        controls
        loop
        playsInline
        autoPlay
        muted
        data-testid="result-video"
        className="mx-auto max-h-[52vh] w-auto max-w-full rounded-xl bg-white shadow-sm ring-1 ring-black/10"
      />

      <p className="text-xs text-neutral-500" data-testid="result-summary">
        {result.width}×{result.height} · {result.frames} frames ·{" "}
        {result.duration.toFixed(1).replace(/\.0$/, "")}s · {fileSize(result.blob.size)}{" "}
        · {result.ext.toUpperCase()}
        {result.ext !== "mp4" &&
          " — this browser could not encode H.264, so it made a WebM. Safari or Chrome will give you an MP4 that saves to Photos."}
      </p>

      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        {shareable && (
          <button
            type="button"
            onClick={async () => {
              const outcome = await shareVideo(result.blob, filename, title);
              if (outcome === "unsupported") {
                downloadVideo(result.blob, filename);
                setNote("Sharing was not available, so it downloaded instead.");
              }
            }}
            className="rounded-full bg-neutral-900 px-4 py-2 font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Share or save to Photos
          </button>
        )}
        <button
          type="button"
          onClick={() => downloadVideo(result.blob, filename)}
          className={[
            "rounded-full px-4 py-2 font-medium transition",
            shareable
              ? "ring-1 ring-black/15 hover:bg-black/5 dark:ring-white/20 dark:hover:bg-white/10"
              : "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
          ].join(" ")}
        >
          Download
        </button>
        {saveEnabled && saveState.kind !== "saved" && (
          <button
            type="button"
            onClick={save}
            disabled={saveState.kind === "saving"}
            data-testid="save-link-button"
            className="rounded-full px-4 py-2 font-medium ring-1 ring-black/15 transition hover:bg-black/5 disabled:opacity-50 dark:ring-white/20 dark:hover:bg-white/10"
          >
            {saveState.kind === "saving"
              ? `Uploading ${Math.round(saveState.percentage)}%`
              : "Get a shareable link"}
          </button>
        )}
      </div>

      {saveState.kind === "saved" && (
        <p className="text-sm" data-testid="share-link">
          Link:{" "}
          <a
            className="font-medium underline"
            href={saveState.url}
            target="_blank"
            rel="noreferrer"
          >
            {saveState.url}
          </a>
        </p>
      )}
      {saveState.kind === "error" && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {saveState.message}
        </p>
      )}
      {note && <p className="text-xs text-neutral-500">{note}</p>}

      <p className="text-xs text-neutral-500">
        On an iPhone, use Share and pick <strong>Save Video</strong> — a plain
        download lands in Files rather than Photos.
        {!saveEnabled &&
          " Shareable links need a Vercel Blob store connected to this project."}
      </p>
    </div>
  );
}

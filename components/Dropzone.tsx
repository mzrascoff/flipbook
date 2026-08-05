"use client";

import { useRef, useState } from "react";

type Props = {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  compact?: boolean;
  label?: string;
};

export default function Dropzone({ onFiles, busy, compact, label }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function pick(list: FileList | null) {
    if (!list?.length) return;
    onFiles(Array.from(list));
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        pick(event.dataTransfer.files);
      }}
      className={[
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition",
        compact ? "px-5 py-6" : "px-6 py-16",
        over
          ? "border-neutral-900 bg-neutral-900/5 dark:border-white dark:bg-white/5"
          : "border-black/15 dark:border-white/20",
      ].join(" ")}
    >
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        data-testid="photo-input"
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />
      {!compact && (
        <p className="text-sm text-neutral-500">
          A burst, or several tries at the same shot
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {busy ? "Reading photos…" : (label ?? "Choose photos")}
      </button>
      {!compact && (
        <p className="text-xs text-neutral-500">
          They stay on this device. Nothing is uploaded.
        </p>
      )}
    </div>
  );
}

"use client";

import { buildBeats, encodeRate, totalDuration } from "@/lib/timing";
import type { Settings } from "@/lib/types";

type Props = {
  settings: Settings;
  photoCount: number;
  maxSizeOptions: number[];
  aligning: { done: number; total: number } | null;
  alignCropped: number | null;
  onChange: (patch: Partial<Settings>) => void;
};

/**
 * Everything here is timing, not retouching — with one exception, auto-align,
 * which is labelled as the thing that crops.
 */
export default function Controls({
  settings,
  photoCount,
  maxSizeOptions,
  aligning,
  alignCropped,
  onChange,
}: Props) {
  const beats = buildBeats(photoCount, settings);
  const seconds = totalDuration(beats, settings.fps);
  const { containerFps, repeat } = encodeRate(settings.fps);

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-black/[0.03] p-5 dark:bg-white/[0.04]">
      <label className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between text-sm font-medium">
          Speed
          <span className="text-xs font-normal tabular-nums text-neutral-500">
            {settings.fps} photos per second
          </span>
        </span>
        <input
          type="range"
          min={2}
          max={12}
          step={1}
          value={settings.fps}
          data-testid="fps-slider"
          onChange={(event) => onChange({ fps: Number(event.target.value) })}
          className="w-full accent-neutral-900 dark:accent-white"
        />
        <span className="text-xs text-neutral-500">
          {seconds.toFixed(1).replace(/\.0$/, "")}s long · encoded at{" "}
          {containerFps} fps with each photo held for {repeat}{" "}
          {repeat === 1 ? "frame" : "frames"}, so players handle it properly
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Size
          <select
            value={settings.maxLongEdge}
            data-testid="size-select"
            onChange={(event) =>
              onChange({ maxLongEdge: Number(event.target.value) })
            }
            className="rounded-lg bg-white px-3 py-2 text-sm font-normal ring-1 ring-black/15 dark:bg-neutral-900 dark:ring-white/20"
          >
            {maxSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}px long edge
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Plays
          <select
            value={settings.loops}
            onChange={(event) => onChange({ loops: Number(event.target.value) })}
            className="rounded-lg bg-white px-3 py-2 text-sm font-normal ring-1 ring-black/15 dark:bg-neutral-900 dark:ring-white/20"
          >
            <option value={1}>Once</option>
            <option value={2}>Twice</option>
            <option value={3}>Three times</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <Toggle
          label="Hold the first and last photo"
          hint="A beat longer at each end, so it does not start or stop abruptly"
          checked={settings.holdEnds}
          onChange={(holdEnds) => onChange({ holdEnds })}
        />
        <Toggle
          label="Boomerang"
          hint="Play through, then back again"
          checked={settings.boomerang}
          onChange={(boomerang) => onChange({ boomerang })}
        />
        <Toggle
          label="Line up the photos"
          hint="Nudges handheld drift into register. This one crops to the area every photo shares — the only setting here that discards any of the picture."
          checked={settings.align}
          testId="align-toggle"
          onChange={(align) => onChange({ align })}
        />
        {aligning && (
          <p className="pl-7 text-xs text-neutral-500" role="status">
            Measuring drift… {aligning.done}/{aligning.total}
          </p>
        )}
        {!aligning && settings.align && alignCropped !== null && (
          <p className="pl-7 text-xs text-neutral-500" role="status">
            {alignCropped === 0
              ? "Already steady — nothing cropped."
              : `Cropped to the shared area (about ${alignCropped}% of each photo trimmed).`}
          </p>
        )}
      </fieldset>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex cursor-pointer gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        data-testid={testId}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-neutral-900 dark:accent-white"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-xs leading-relaxed text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}

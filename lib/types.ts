export type Photo = {
  id: string;
  file: File;
  /** Capture time in ms. EXIF DateTimeOriginal when available, else file.lastModified. */
  takenAt: number;
  /** Whether takenAt came from EXIF (true) or the filesystem (false). */
  fromExif: boolean;
  /** Original pixel dimensions, after EXIF orientation is applied. */
  width: number;
  height: number;
  /** Object URL of a downscaled JPEG used for thumbnails and preview playback. */
  previewUrl: string;
  /** Decoded element for the preview URL, ready to draw. */
  previewImg: HTMLImageElement;
};

export type Series = {
  id: string;
  title: string;
  photoIds: string[];
};

export type Settings = {
  /** Displayed photos per second. */
  fps: number;
  /** Longest edge of the exported video, in pixels. */
  maxLongEdge: number;
  /** How many times the sequence plays. */
  loops: number;
  /** Play forwards then backwards. */
  boomerang: boolean;
  /** Hold the first and last photo for twice as long. */
  holdEnds: boolean;
  /** Nudge photos into register, cropping to the shared area. */
  align: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  fps: 5,
  maxLongEdge: 1080,
  loops: 1,
  boomerang: false,
  holdEnds: true,
  align: false,
};

/** Metadata stored alongside a saved flipbook, as `flipbooks/<id>/meta.json`. */
export type FlipbookMeta = {
  id: string;
  title: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
  duration: number;
  ext: string;
  contentType: string;
  videoUrl: string;
  posterUrl: string;
  createdAt: string;
};

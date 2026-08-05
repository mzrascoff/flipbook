# Flipbook

Turn a series of photos into a short video that still reads as photographs —
the feel of a flipbook or early film.

The whole point is honesty to the originals. No interpolation, no filters, no
grain, no generated frames. The old-film quality comes entirely from **timing**:
each photograph is held for a beat and cut hard to the next.

Everything runs in the browser. Photos are never uploaded.

## How it works

| Step | What happens |
|---|---|
| Import | EXIF `DateTimeOriginal` read client-side; photos sorted and clustered into series wherever the gap exceeds 10s |
| Decode | `createImageBitmap(file, { imageOrientation: 'from-image' })`, with a lazily-loaded wasm HEIC decoder for browsers that cannot read HEIC |
| Compose | Each photo fit whole onto a frame sized from the set's most common aspect ratio; anything that does not fill it sits on white |
| Encode | [mediabunny](https://mediabunny.dev) + WebCodecs, hardware H.264 into MP4 |
| Share | `navigator.share` with the file (iOS: **Save Video** → Photos), plain download, or an optional link backed by Vercel Blob |

### Why the encoded frame rate isn't the frame rate you pick

A genuine 5 fps MP4 gets mishandled by iOS Photos, iMessage and most social
apps. So the container rate is always at least 24 fps and each photograph is
repeated for `ceil(24 / fps)` identical frames. The displayed rate is exactly
what you asked for; the duplicates cost almost nothing because H.264 codes them
as near-empty P-frames. See `lib/timing.ts`.

### Auto-align

Off by default, and it is the only feature that discards any of the picture. It
estimates translation only — no rotation, no scale — between consecutive photos,
then crops everything to the rectangle they all share. It refuses to trim more
than a third of the frame in either direction.

## Layout

```
app/
  page.tsx                    the studio (client)
  f/[id]/page.tsx             a saved flipbook, with OG tags
  api/blob/upload/route.ts    client-upload tokens
  api/flipbooks/route.ts      GET availability, POST the metadata record
lib/
  import.ts   decode.ts   exif.ts    group.ts
  frame.ts    align.ts    timing.ts  encode.ts   share.ts   flipbooks.ts
components/
  Dropzone  SeriesList  FrameStrip  Preview  Controls  ExportPanel
```

There is no database. A saved flipbook is three objects in Blob storage under
`flipbooks/<nanoid(16)>/` — `video.mp4`, `poster.jpg`, `meta.json`. The
16-character id is the only access control: unguessable, but anyone with the
link can watch.

## Development

```bash
npm run dev
```

Shareable links need a Vercel Blob store connected to the project. Without
`BLOB_READ_WRITE_TOKEN` the app hides that option rather than failing on upload —
creating and downloading flipbooks works either way.

```bash
vercel link && vercel env pull
```

## Known limits

- A fixed-size video means large photos get a uniform downscale (default 1080
  long edge; the selector offers only sizes the device can actually encode).
  That is a resolution change, not an edit — no crop, no filter, no reframing.
- Chrome, Firefox and Edge cannot decode HEIC natively and use the wasm
  fallback. If a browser cannot encode H.264 at all, the export falls back to
  WebM and says so.
- Exports are capped at 2400 encoded frames.

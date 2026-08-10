import Link from "next/link";

export const metadata = {
  title: "About — Flipbook",
  description:
    "What Flipbook is, what happens to your photos, and what the license costs.",
};

/**
 * Everything the home page deliberately doesn't say. One page, plain
 * language, no sections the app can't back up.
 */
export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">About Flipbook</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">What it is</h2>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Flipbook turns photos you shot as a series — a burst, or several
          tries at the same shot — into a short video that still reads as
          photographs. Each photo is held for a beat and cut hard to the next.
          Nothing is filtered, retouched, interpolated, or generated; the
          pixels in the video are the pixels you shot. The oldest version of
          this idea is on the home page: Eadweard Muybridge&apos;s 1878
          galloping horse, eleven photographs played in order, public domain,
          exported with this tool.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Privacy</h2>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Your photos never leave your device. Decoding, alignment, and video
          encoding all happen in your browser — there is no upload step, no
          account, and no analytics. The one exception is explicit: if you ask
          for a shareable link, the finished video (never the photos) is
          uploaded so the link has something to point to. Payment happens on
          Stripe&apos;s servers; card details never touch this site.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">The price</h2>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          The first three videos are free. After that, a year of Flipbook is
          $12 — every video you can make, on any device. It is a single
          payment, not a subscription: nothing renews by itself, and when the
          year is over the app simply asks again. Sales tax, where it applies,
          is calculated and remitted by Stripe. Your license is a small code
          delivered on the purchase page and kept in your browser; paste it on
          any other device to license it too, and the link in your Stripe
          receipt re-issues it if you ever lose it. Because there are no
          accounts, the license is the whole system.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">The code</h2>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Flipbook is built by{" "}
          <a
            className="font-medium underline"
            href="https://mzrascoff.com"
            target="_blank"
            rel="noreferrer"
          >
            Matthew Rascoff
          </a>{" "}
          and the source is public at{" "}
          <a
            className="font-medium underline"
            href="https://github.com/mzrascoff/flipbook"
            target="_blank"
            rel="noreferrer"
          >
            github.com/mzrascoff/flipbook
          </a>
          .
        </p>
      </section>

      <Link href="/" className="text-sm font-medium underline">
        Back to Flipbook
      </Link>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { storeLicense, verifyLicense } from "@/lib/license";

type State =
  | { kind: "claiming" }
  | { kind: "ready"; token: string; email: string; expires: string }
  | { kind: "error"; message: string };

/**
 * Lands here from Stripe Checkout. Claims the license for this purchase,
 * stores it in this browser, and shows the token to keep for other devices.
 * This page's own URL re-issues the license, so it doubles as recovery —
 * which is why the downloaded license file carries it. Stripe's receipt does
 * not link back here, so the page never sends buyers looking for it there.
 */
export default function SuccessClient({
  sessionId,
  emailEnabled,
}: {
  sessionId: string | null;
  /** Whether the webhook emails the license (RESEND_API_KEY is set). */
  emailEnabled: boolean;
}) {
  const [state, setState] = useState<State>(() =>
    sessionId
      ? { kind: "claiming" }
      : {
          kind: "error",
          message: "This link is missing its purchase reference.",
        },
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/license/claim?session_id=${encodeURIComponent(sessionId)}`,
        );
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { token: string };
        // Trust nothing: validate the token exactly as the app will.
        const claims = await verifyLicense(data.token);
        if (!claims) throw new Error();
        if (cancelled) return;
        storeLicense(data.token);
        setState({
          kind: "ready",
          token: data.token,
          email: claims.email,
          expires: new Date(claims.exp * 1000).toLocaleDateString(),
        });
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              "The purchase could not be confirmed yet. If you paid, reload this page in a minute — its address re-issues your license any time.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-16">
      <h1 className="text-2xl font-medium tracking-tight">
        {state.kind === "error" ? "Something went wrong" : "Thank you"}
      </h1>

      {state.kind === "claiming" && (
        <p className="text-sm text-neutral-500" role="status">
          Confirming your purchase…
        </p>
      )}

      {state.kind === "ready" && (
        <>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            Flipbook is yours until {state.expires}. This browser is already
            licensed. To use it on another device, paste this license under
            &ldquo;Already bought it?&rdquo; there.
          </p>
          <p
            className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
            data-testid="save-license-note"
          >
            <strong>Save your license now.</strong> There are no accounts, so
            this license is how you get back in if you clear this browser or
            switch devices. Download it, copy it somewhere safe, or bookmark
            this page — its address re-issues the license any time.
          </p>
          <div className="flex flex-col gap-2">
            <code
              data-testid="license-token"
              className="break-all rounded-xl bg-black/5 p-4 text-xs dark:bg-white/10"
            >
              {state.token}
            </code>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadLicense(state)}
                data-testid="download-license"
                className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Download license
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.token);
                  setCopied(true);
                }}
                data-testid="copy-license"
                className="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-black/15 transition hover:bg-black/5 dark:ring-white/20 dark:hover:bg-white/10"
              >
                {copied ? "Copied" : "Copy license"}
              </button>
            </div>
          </div>
          {state.email && (
            <p className="text-xs text-neutral-500">
              Purchased as {state.email}.
              {emailEnabled &&
                " A copy of this license is on its way to that address."}
            </p>
          )}
        </>
      )}

      {state.kind === "error" && (
        <p
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {state.message}
        </p>
      )}

      <Link href="/" className="text-sm font-medium underline">
        Back to Flipbook
      </Link>
    </main>
  );
}

/**
 * Saves the license as a small text file: the token to paste, plus this
 * page's address, which re-issues the license if the token is ever lost.
 */
function downloadLicense({
  token,
  email,
  expires,
}: {
  token: string;
  email: string;
  expires: string;
}) {
  const text = [
    "Flipbook license",
    "",
    `Valid until: ${expires}`,
    ...(email ? [`Purchased as: ${email}`] : []),
    "",
    "To use Flipbook on a device, open flipbook.photos, choose",
    "\u201cAlready bought it?\u201d and paste this license:",
    "",
    token,
    "",
    "If you lose the license, open this link to have it re-issued:",
    window.location.href,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "flipbook-license.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

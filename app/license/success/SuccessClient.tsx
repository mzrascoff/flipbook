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
 * The same URL sits in the receipt email, so it also serves as recovery.
 */
export default function SuccessClient({
  sessionId,
}: {
  sessionId: string | null;
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
              "The purchase could not be confirmed. If you paid, reopen the link in your Stripe receipt email — it re-issues your license any time.",
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
            licensed. To use it elsewhere, paste this license on any device —
            or just open this page&apos;s link from your receipt email there.
          </p>
          <div className="flex flex-col gap-2">
            <code
              data-testid="license-token"
              className="break-all rounded-xl bg-black/5 p-4 text-xs dark:bg-white/10"
            >
              {state.token}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(state.token);
                setCopied(true);
              }}
              className="self-start rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {copied ? "Copied" : "Copy license"}
            </button>
          </div>
          {state.email && (
            <p className="text-xs text-neutral-500">
              Purchased as {state.email}. Keep the Stripe receipt — its link
              re-issues this license if you ever lose it.
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

import "server-only";

/** Where buyers land when a request's origin is not one this app runs on. */
export const CANONICAL_ORIGIN = "https://flipbook.photos";

const ALLOWED_HOSTS = new Set([
  "flipbook.photos",
  "www.flipbook.photos",
  "flipbook-ruddy-eta.vercel.app",
]);

/** This project's own preview deployments, scoped to the team's slug. */
const PREVIEW_HOST = /^flipbook-[a-z0-9-]+-matthew-zev-rascoff-s-projects\.vercel\.app$/;

/**
 * Turns an untrusted origin (a request's Origin header, a stored success_url)
 * into one this app actually runs on. Anything else falls back to the
 * canonical domain, so a forged header can never send a buyer — or the
 * license link in their email — somewhere else.
 */
export function trustedOrigin(candidate: string | null | undefined): string {
  if (!candidate) return CANONICAL_ORIGIN;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return CANONICAL_ORIGIN;
  }

  if (url.protocol === "https:") {
    if (ALLOWED_HOSTS.has(url.hostname) || PREVIEW_HOST.test(url.hostname)) {
      return url.origin;
    }
  }
  if (
    process.env.NODE_ENV !== "production" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) {
    return url.origin;
  }
  return CANONICAL_ORIGIN;
}

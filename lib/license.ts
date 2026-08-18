/**
 * Freemium licensing, kept in the spirit of the app: no accounts, nothing
 * phones home. The first few exports are free, counted in localStorage. A
 * purchase buys a year-long license delivered as a signed token — portable
 * across devices by pasting it, verified offline against the public key below.
 *
 * The free counter is honor-system by design: clearing browser storage resets
 * it, and hardening that would cost more goodwill than it protects revenue.
 */

/** Exports that work before a license is asked for. */
export const FREE_EXPORTS = 3;

/** One year, in seconds — the license term. */
export const LICENSE_TERM_SECONDS = 365 * 24 * 60 * 60;

export const LICENSE_PREFIX = "FLIP";

/** SPKI (base64) for the ECDSA P-256 key that signs licenses. */
const PUBLIC_KEY_B64 =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKdK96v5Bj6CdjZEemPD4ZjEWY79MYQ1Gs4tMKQOqW73VLob2iIx5BAe/qU6QcgL9fvESSpZE9Ag2brbt47942g==";

export type LicenseClaims = {
  v: 1;
  /** Email the purchase was made under — display only. */
  email: string;
  /** Issued at, from the Stripe session so re-claims never extend the term. */
  iat: number;
  /** Unix seconds after which the license no longer validates. */
  exp: number;
};

const TOKEN_KEY = "flipbook.license";
const EXPORTS_KEY = "flipbook.exports";

function fromBase64(b64: string): Uint8Array {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Verifies a token's signature and expiry. Resolves to its claims when valid,
 * null for anything else — malformed, forged, or expired.
 */
export async function verifyLicense(
  token: string,
): Promise<LicenseClaims | null> {
  try {
    const [prefix, payload, signature] = token.trim().split(".");
    if (prefix !== LICENSE_PREFIX || !payload || !signature) return null;

    const key = await crypto.subtle.importKey(
      "spki",
      fromBase64(PUBLIC_KEY_B64) as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromBase64(signature) as BufferSource,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const claims = JSON.parse(
      new TextDecoder().decode(fromBase64(payload)),
    ) as LicenseClaims;
    if (claims.v !== 1 || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * The license lives in localStorage and in a cookie. Either alone is fragile:
 * localStorage does not survive some privacy modes, and Safari caps
 * script-set cookies at seven days under ITP. Between the two, and the
 * receipt email that can re-issue the token, a paying customer should never
 * find themselves locked out.
 */
export function storedLicense(): string | null {
  try {
    const local = localStorage.getItem(TOKEN_KEY);
    if (local) return local;
  } catch {
    // Fall through to the cookie.
  }
  try {
    const match = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${TOKEN_KEY}=`));
    return match ? decodeURIComponent(match.slice(TOKEN_KEY.length + 1)) : null;
  } catch {
    return null;
  }
}

export function storeLicense(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private browsing without storage — the cookie below still applies.
  }
  try {
    document.cookie = [
      `${TOKEN_KEY}=${encodeURIComponent(token)}`,
      `max-age=${LICENSE_TERM_SECONDS}`,
      "path=/",
      "samesite=lax",
      "secure",
    ].join("; ");
  } catch {
    // No cookies either — the license only lasts the session.
  }
}

export function exportsUsed(): number {
  try {
    const n = Number(localStorage.getItem(EXPORTS_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/* The meter is external state (localStorage), read via useSyncExternalStore.
   Local writes notify listeners directly; the storage event covers other tabs. */
const meterListeners = new Set<() => void>();

export function subscribeToMeter(listener: () => void): () => void {
  meterListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === EXPORTS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    meterListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function noteExport() {
  try {
    localStorage.setItem(EXPORTS_KEY, String(exportsUsed() + 1));
  } catch {
    // Same storage caveat as above.
  }
  for (const listener of meterListeners) listener();
}

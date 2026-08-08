import "server-only";

import { createPrivateKey, sign } from "node:crypto";

import { LICENSE_PREFIX, type LicenseClaims } from "./license";

/**
 * Mints a signed license token. The private key lives only in the server
 * environment; the app verifies tokens offline against the public key baked
 * into lib/license.ts, so a licensed session never has to phone home.
 *
 * Signatures are ECDSA P-256 in IEEE P1363 form — the raw (r ‖ s) layout
 * WebCrypto's `verify` expects, not DER.
 */
export function mintLicense(claims: LicenseClaims): string {
  const keyB64 = process.env.LICENSE_SIGNING_KEY;
  if (!keyB64) throw new Error("LICENSE_SIGNING_KEY is not configured");

  const key = createPrivateKey({
    key: Buffer.from(keyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign("sha256", Buffer.from(payload), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return `${LICENSE_PREFIX}.${payload}.${signature}`;
}

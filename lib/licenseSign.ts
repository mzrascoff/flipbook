import { createPrivateKey, sign } from "node:crypto";

/**
 * The one signing implementation, shared by the server (via licenseServer.ts)
 * and scripts/mint-license.mjs, which Node runs directly — so this module
 * imports nothing but node:crypto, and the prefix arrives as a parameter
 * rather than via lib/license.ts (extensionless imports don't resolve under
 * plain `node`).
 *
 * Signatures are ECDSA P-256 in IEEE P1363 form — the raw (r ‖ s) layout
 * WebCrypto's `verify` expects, not DER.
 */
export function signLicense(
  claims: object,
  privateKeyB64: string,
  prefix: string,
): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign("sha256", Buffer.from(payload), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return `${prefix}.${payload}.${signature}`;
}

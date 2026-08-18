#!/usr/bin/env node
/**
 * Mints a gift license token from the command line.
 *
 * A gift is just a license: the recipient pastes the token into
 * "Already bought it?" on the site and their browser is licensed. No Stripe,
 * no code list to maintain — possession of a validly signed token is the gift.
 *
 *   node scripts/mint-license.mjs                        one year, no email
 *   node scripts/mint-license.mjs friend@example.com     labeled with an email
 *   node scripts/mint-license.mjs friend@example.com 2   two years
 *
 * Needs LICENSE_SIGNING_KEY, read from the environment or .env.local
 * (`vercel env pull` fetches it).
 */

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

let keyB64 = process.env.LICENSE_SIGNING_KEY;
if (!keyB64) {
  try {
    const env = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"),
      "utf8",
    );
    keyB64 = env.match(/^LICENSE_SIGNING_KEY="?([^"\n]+)"?$/m)?.[1];
  } catch {
    // fall through to the error below
  }
}
if (!keyB64) {
  console.error(
    "LICENSE_SIGNING_KEY is not set. Run `vercel env pull .env.local` first.",
  );
  process.exit(1);
}

const email = process.argv[2] ?? "";
const years = Math.max(1, Number(process.argv[3]) || 1);

const now = Math.floor(Date.now() / 1000);
const claims = { v: 1, email, iat: now, exp: now + years * YEAR_SECONDS };

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

console.log(`FLIP.${payload}.${signature}`);
console.error(
  `\nValid until ${new Date(claims.exp * 1000).toDateString()}${email ? ` · ${email}` : ""}`,
);
console.error(
  "Send the token above; it activates under “Already bought it?” on flipbook.photos",
);

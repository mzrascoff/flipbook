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
 * (`vercel env pull` fetches it). Node strips the types from the imported
 * lib/*.ts modules natively, so this shares the app's actual signing code
 * and constants rather than a copy.
 */

import { readFileSync } from "node:fs";

import { LICENSE_PREFIX, LICENSE_TERM_SECONDS } from "../lib/license.ts";
import { signLicense } from "../lib/licenseSign.ts";

let keyB64 = process.env.LICENSE_SIGNING_KEY;
if (!keyB64) {
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    keyB64 = env.match(/^LICENSE_SIGNING_KEY="?([^"\n]+?)"?$/m)?.[1];
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
const claims = { v: 1, email, iat: now, exp: now + years * LICENSE_TERM_SECONDS };

console.log(signLicense(claims, keyB64, LICENSE_PREFIX));
console.error(
  `\nValid until ${new Date(claims.exp * 1000).toDateString()}${email ? ` · ${email}` : ""}`,
);
console.error(
  "Send the token above; it activates under “Already bought it?” on flipbook.photos",
);

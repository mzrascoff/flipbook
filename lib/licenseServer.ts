import "server-only";

import type Stripe from "stripe";

import {
  LICENSE_PREFIX,
  LICENSE_TERM_SECONDS,
  type LicenseClaims,
} from "./license";
import { signLicense } from "./licenseSign";

/**
 * Mints a signed license token. The private key lives only in the server
 * environment; the app verifies tokens offline against the public key baked
 * into lib/license.ts, so a licensed session never has to phone home.
 */
export function mintLicense(claims: LicenseClaims): string {
  const keyB64 = process.env.LICENSE_SIGNING_KEY;
  if (!keyB64) throw new Error("LICENSE_SIGNING_KEY is not configured");
  return signLicense(claims, keyB64, LICENSE_PREFIX);
}

/**
 * True when a Checkout session is a finished license purchase. Every place
 * that turns a session into a license — the claim route, the webhook — must
 * use this one predicate, or the two paths drift.
 *
 * The status and mode checks matter: a setup-mode session reports
 * payment_status "no_payment_required" even while still open, so accepting
 * that status alone would mint licenses for sessions nobody paid for.
 * "no_payment_required" on a complete payment-mode session is legitimate —
 * it is what a checkout covered entirely by a 100%-off gift code reports.
 */
export function sessionSettled(session: Stripe.Checkout.Session): boolean {
  return (
    session.status === "complete" &&
    session.mode === "payment" &&
    (session.payment_status === "paid" ||
      session.payment_status === "no_payment_required")
  );
}

/**
 * The claims a purchase earns. Anchored to the session's creation time, so
 * re-claiming (from the receipt link or a webhook redelivery) never extends
 * the term.
 */
export function claimsForSession(
  session: Stripe.Checkout.Session,
): LicenseClaims {
  return {
    v: 1,
    email: session.customer_details?.email ?? "",
    iat: session.created,
    exp: session.created + LICENSE_TERM_SECONDS,
  };
}

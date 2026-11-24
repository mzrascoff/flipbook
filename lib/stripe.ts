import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Server-side Stripe client. Keys come from the Vercel Stripe integration.
 * Created on first use rather than at import, so `next build` (which loads
 * route modules) works without STRIPE_SECRET_KEY in the environment.
 */
export function getStripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return client;
}

/**
 * Preview API version required for Managed Payments (per Stripe's setup
 * guide). Passed per-request, so everything else stays on the SDK default.
 */
export const MANAGED_PAYMENTS_VERSION =
  "2026-02-25.preview" as Stripe.LatestApiVersion;

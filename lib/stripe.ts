import "server-only";

import Stripe from "stripe";

/** Server-side Stripe client. Keys come from the Vercel Stripe integration. */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * Preview API version required for Managed Payments (per Stripe's setup
 * guide). Passed per-request, so everything else stays on the SDK default.
 */
export const MANAGED_PAYMENTS_VERSION =
  "2026-02-25.preview" as Stripe.LatestApiVersion;

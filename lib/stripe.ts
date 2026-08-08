import "server-only";

import Stripe from "stripe";

/** Server-side Stripe client. Keys come from the Vercel Stripe integration. */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

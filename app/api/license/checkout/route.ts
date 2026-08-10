import { NextResponse } from "next/server";

import { MANAGED_PAYMENTS_VERSION, stripe } from "@/lib/stripe";

/**
 * The one-year-license price, looked up once by its stable key. An id would
 * differ between the sandbox and the live account; the lookup key does not —
 * `scripts/stripe-setup.mjs` creates the product either place.
 */
const PRICE_LOOKUP_KEY = "flipbook_year_license";
let cachedPriceId: string | null = null;

async function licensePriceId(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;
  const prices = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(
      `No price with lookup key ${PRICE_LOOKUP_KEY} — run scripts/stripe-setup.mjs against this Stripe account`,
    );
  }
  cachedPriceId = price.id;
  return price.id;
}

/**
 * Starts a Stripe Checkout session for the one-year license.
 *
 * Managed Payments makes Stripe the merchant of record, so tax on this
 * digital good is calculated, collected, and remitted by Stripe — which is
 * why the product carries a tax code and this call pins Stripe's preview API
 * version (both required by the Managed Payments setup guide).
 */
export async function POST(request: Request) {
  const origin =
    request.headers.get("origin") ?? "https://flipbook.photos";

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ price: await licensePriceId(), quantity: 1 }],
        // Not in the SDK's types until the preview version graduates.
        ...({ managed_payments: { enabled: true } } as object),
        success_url: `${origin}/license/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: origin,
      },
      { apiVersion: MANAGED_PAYMENTS_VERSION },
    );
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Could not start checkout" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";

/** Starts a Stripe Checkout session for the one-year license. */
export async function POST(request: Request) {
  const origin =
    request.headers.get("origin") ?? "https://flipbook.photos";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 1200,
            product_data: {
              name: "Flipbook — one-year license",
              description:
                "Every video you can make, for a year, on any device.",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/license/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: origin,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Could not start checkout" },
      { status: 502 },
    );
  }
}

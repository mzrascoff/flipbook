import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

/**
 * Stripe webhook receiver, registered by scripts/stripe-setup.mjs for
 * checkout.session.completed.
 *
 * Licenses are minted by the claim route when the buyer lands on the success
 * page, so nothing here is load-bearing yet — this exists to observe every
 * completed purchase server-side (the log line below shows up in Vercel's
 * runtime logs) and as the hook point for delivering licenses by email later.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log(
      `license purchase completed: session=${session.id} email=${session.customer_details?.email ?? "?"} total=${session.amount_total ?? "?"}`,
    );
  }

  return NextResponse.json({ received: true });
}

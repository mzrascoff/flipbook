import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { LICENSE_TERM_SECONDS } from "@/lib/license";
import { mintLicense } from "@/lib/licenseServer";
import { stripe } from "@/lib/stripe";

/**
 * Stripe webhook receiver, registered by scripts/stripe-setup.mjs for
 * checkout.session.completed. Logs every completed purchase (visible in
 * Vercel's runtime logs) and emails the buyer their license.
 *
 * The success page already claims and stores the license in the buying
 * browser; this email is what gets it to their other devices. Opening the
 * link on a phone licenses that phone, and the token in the body can be
 * pasted anywhere. The claim route stays the recovery path — this hook only
 * adds delivery, so if email ever fails the purchase still works.
 *
 * Sending goes through Resend's plain HTTP API. Without RESEND_API_KEY the
 * event is acknowledged and nothing is sent — Stripe must not retry forever
 * over a feature that is switched off.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "No webhook secret" }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
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

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  console.log(
    `license purchase completed: session=${session.id} email=${session.customer_details?.email ?? "?"} total=${session.amount_total ?? "?"}`,
  );

  const paid =
    session.payment_status === "paid" ||
    // What a checkout covered entirely by a 100%-off gift code reports.
    session.payment_status === "no_payment_required";
  const email = session.customer_details?.email;
  if (!paid || !email) return NextResponse.json({ received: true });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`License email skipped (no RESEND_API_KEY) for ${session.id}`);
    return NextResponse.json({ received: true });
  }

  const claims = {
    v: 1 as const,
    email,
    iat: session.created,
    exp: session.created + LICENSE_TERM_SECONDS,
  };
  const token = mintLicense(claims);
  const until = new Date(claims.exp * 1000).toDateString();
  const link = `https://flipbook.photos/license/success?session_id=${session.id}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LICENSE_EMAIL_FROM ?? "Flipbook <licenses@flipbook.photos>",
      to: [email],
      subject: "Your Flipbook license",
      text: [
        `Thanks for buying a year of Flipbook. It is yours until ${until}.`,
        "",
        "The browser you bought it in is already licensed. To use Flipbook on",
        "another device, open this link there:",
        "",
        link,
        "",
        "Or paste this license under “Already bought it?” on flipbook.photos:",
        "",
        token,
        "",
        "Keep this email — the link re-issues your license any time.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    // A 5xx makes Stripe retry later, which is what a transient mail
    // failure deserves.
    return NextResponse.json({ error: "Email failed" }, { status: 502 });
  }

  return NextResponse.json({ received: true });
}

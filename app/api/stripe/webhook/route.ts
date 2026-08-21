import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  claimsForSession,
  mintLicense,
  sessionSettled,
} from "@/lib/licenseServer";
import { stripe } from "@/lib/stripe";

/**
 * Stripe webhook receiver, registered by scripts/stripe-setup.mjs. Logs every
 * completed purchase (visible in Vercel's runtime logs) and emails the buyer
 * their license.
 *
 * Two events matter: checkout.session.completed for the ordinary instant
 * purchase, and checkout.session.async_payment_succeeded for
 * delayed-notification payment methods, whose `completed` event arrives
 * still unpaid. Both carry the session, and sessionSettled decides.
 *
 * The success page already claims and stores the license in the buying
 * browser; this email is what gets it to their other devices. Opening the
 * link on a phone licenses that phone, and the token in the body can be
 * pasted anywhere. The claim route stays the recovery path — this hook only
 * adds delivery, so if email ever fails the purchase still works.
 *
 * Sending goes through Resend's plain HTTP API. Without RESEND_API_KEY the
 * event is acknowledged and nothing is sent. Only plausibly transient
 * failures (429, 5xx, network) are returned as errors for Stripe to retry;
 * a misconfiguration — bad key, unverified domain, missing signing key —
 * is logged and acknowledged, because retrying it cannot succeed and days
 * of failures get the whole endpoint disabled.
 */

const LICENSE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

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

  if (!LICENSE_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  // The Set check above admits only checkout.session.* events, whose data
  // object is always a Checkout Session; the Set membership test just cannot
  // narrow the union the way a === comparison would.
  const session = event.data.object as Stripe.Checkout.Session;
  console.log(
    `license purchase event: type=${event.type} session=${session.id} email=${session.customer_details?.email ?? "?"} total=${session.amount_total ?? "?"} payment_status=${session.payment_status}`,
  );

  const email = session.customer_details?.email;
  if (!sessionSettled(session) || !email) {
    return NextResponse.json({ received: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`License email skipped (no RESEND_API_KEY) for ${session.id}`);
    return NextResponse.json({ received: true });
  }

  let response: Response;
  try {
    const claims = claimsForSession(session);
    const token = mintLicense(claims);
    const until = new Date(claims.exp * 1000).toDateString();
    /* The link points at the origin this purchase actually ran on (the
       checkout route builds success_url from its request origin), so a
       sandbox purchase on a preview deployment emails a preview link that
       resolves in the same Stripe account. */
    const origin = new URL(session.success_url ?? "https://flipbook.photos")
      .origin;
    const link = `${origin}/license/success?session_id=${session.id}`;

    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        /* Stripe delivers at least once; keyed on the session, a redelivered
           event repeats the same send instead of mailing a second token. */
        "idempotency-key": `license-email-${session.id}`,
      },
      body: JSON.stringify({
        from:
          process.env.LICENSE_EMAIL_FROM ?? "Flipbook <licenses@flipbook.photos>",
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
  } catch (error) {
    // Minting throws only on misconfiguration (no signing key); fetch throws
    // on network failure. Log both, but only ask Stripe to retry the one a
    // retry could fix.
    const transient = !(error instanceof Error && /LICENSE_SIGNING_KEY/.test(error.message));
    console.error(`License email for ${session.id} threw:`, error);
    return transient
      ? NextResponse.json({ error: "Email failed" }, { status: 502 })
      : NextResponse.json({ received: true });
  }

  if (response.status === 429 || response.status >= 500) {
    return NextResponse.json({ error: "Email failed" }, { status: 502 });
  }
  if (!response.ok) {
    console.error(
      `License email for ${session.id} rejected (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }

  return NextResponse.json({ received: true });
}

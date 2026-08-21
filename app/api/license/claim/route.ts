import { NextResponse } from "next/server";

import {
  claimsForSession,
  mintLicense,
  sessionSettled,
} from "@/lib/licenseServer";
import { stripe } from "@/lib/stripe";

/**
 * Exchanges a paid Checkout session for a license token.
 *
 * This doubles as recovery: the success URL in the receipt email carries the
 * session id, and session ids are unguessable, so revisiting that link on any
 * device re-issues the same license. The term is anchored to the session's
 * creation time, so a re-claim never extends it.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!sessionSettled(session)) {
      return NextResponse.json({ error: "Not paid" }, { status: 402 });
    }

    const claims = claimsForSession(session);
    return NextResponse.json({ token: mintLicense(claims), ...claims });
  } catch {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
}

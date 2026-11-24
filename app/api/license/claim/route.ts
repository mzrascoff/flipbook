import { NextResponse } from "next/server";

import {
  claimsForSession,
  mintLicense,
  sessionSettled,
} from "@/lib/licenseServer";
import { getStripe } from "@/lib/stripe";

/**
 * Exchanges a paid Checkout session for a license token.
 *
 * This doubles as recovery: the success page's URL carries the session id,
 * and session ids are unguessable, so revisiting that link (bookmarked, saved
 * in the downloaded license file, or from the license email when sending is
 * configured) on any device re-issues the same license. The term is anchored to the session's
 * creation time, so a re-claim never extends it.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (!sessionSettled(session)) {
      return NextResponse.json({ error: "Not paid" }, { status: 402 });
    }

    const claims = claimsForSession(session);
    return NextResponse.json({ token: mintLicense(claims), ...claims });
  } catch {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
}

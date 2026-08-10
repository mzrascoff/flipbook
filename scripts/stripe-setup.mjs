/**
 * One-time Stripe setup for Flipbook, safe to re-run and safe to run again
 * against the live account after the sandbox is retired.
 *
 * Creates (if absent):
 * - the "Flipbook — one-year license" product, tax-coded as personal-use SaaS
 *   so Managed Payments can compute tax on it, with a $12 price under the
 *   lookup key the checkout route resolves at runtime;
 * - the production webhook endpoint for checkout.session.completed.
 *
 * Usage: STRIPE_SECRET_KEY=… node scripts/stripe-setup.mjs [--webhook-secret-file <path>]
 * The webhook signing secret is only revealed on creation, so it is written
 * to the given file (never stdout) for transfer into env storage.
 */
import Stripe from "stripe";
import { readFileSync, writeFileSync } from "node:fs";

/* Outside `next dev`, nothing loads .env.local for us. */
if (!process.env.STRIPE_SECRET_KEY) {
  const match = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .match(/^STRIPE_SECRET_KEY="([^"]+)"/m);
  if (match) process.env.STRIPE_SECRET_KEY = match[1];
}

export const PRICE_LOOKUP_KEY = "flipbook_year_license";
const TAX_CODE = "txcd_10103000"; // Software as a service (SaaS) - personal use
const WEBHOOK_URL = "https://flipbook.photos/api/stripe/webhook";
/** Managed Payments requires this preview version (see Stripe setup guide). */
const PREVIEW_VERSION = "2026-02-25.preview";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function ensureProductAndPrice() {
  const existing = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    limit: 1,
  });
  if (existing.data[0]) {
    return { priceId: existing.data[0].id, productId: existing.data[0].product, created: false };
  }

  const product = await stripe.products.create(
    {
      name: "Flipbook — one-year license",
      description: "Every video you can make, for a year, on any device.",
      tax_code: TAX_CODE,
    },
    { apiVersion: PREVIEW_VERSION },
  );
  const price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: 1200,
      currency: "usd",
      lookup_key: PRICE_LOOKUP_KEY,
      tax_behavior: "exclusive",
    },
    { apiVersion: PREVIEW_VERSION },
  );
  await stripe.products.update(product.id, { default_price: price.id });
  return { priceId: price.id, productId: product.id, created: true };
}

async function ensureWebhook(secretFile) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === WEBHOOK_URL);
  if (existing) return { webhookId: existing.id, created: false };

  const endpoint = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: ["checkout.session.completed"],
    description: "Flipbook license purchases",
  });
  if (secretFile) writeFileSync(secretFile, endpoint.secret, { mode: 0o600 });
  return { webhookId: endpoint.id, created: true, secretWrittenTo: Boolean(secretFile) };
}

const secretFileFlag = process.argv.indexOf("--webhook-secret-file");
const secretFile = secretFileFlag === -1 ? null : process.argv[secretFileFlag + 1];

const product = await ensureProductAndPrice();
const webhook = await ensureWebhook(secretFile);
console.log(JSON.stringify({ ...product, ...webhook }, null, 2));

// POST /api/create-invoice
// Creates a unique NOWPayments invoice (checkout link) for one listing payment.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return json({ error: "Payments are not configured" }, 500);

  let body = {};
  try { body = await req.json(); } catch {}
  const ticker = String(body.ticker || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase();
  const name = String(body.name || "").slice(0, 60);
  const mint = String(body.mint || "");
  if (!ticker || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return json({ error: "Invalid coin details" }, 400);

  const orderId = "list_" + crypto.randomBytes(12).toString("hex"); // unique per payment
  const site = process.env.URL || new URL(req.url).origin;

  const res = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      price_amount: Number(process.env.LISTING_PRICE_AMOUNT || 0.1),
      price_currency: process.env.LISTING_PRICE_CURRENCY || "sol",
      pay_currency: process.env.LISTING_PAY_CURRENCY || "sol",
      order_id: orderId,
      order_description: `SHILLPAID listing: $${ticker} ${name}`.trim(),
      ipn_callback_url: `${site}/api/nowpayments-ipn`,
      success_url: `${site}/#market`,
      cancel_url: `${site}/#market`
    })
  });
  const inv = await res.json().catch(() => null);
  if (!res.ok || !inv || !inv.invoice_url) {
    console.error("NOWPayments invoice error", res.status, inv);
    return json({ error: "Could not create payment link" }, 502);
  }

  const store = getStore({ name: "listing-orders", consistency: "strong" });
  await store.setJSON(orderId, {
    orderId, invoiceId: String(inv.id), ticker, mint,
    status: "waiting", paid: false, createdAt: Date.now()
  });

  return json({ orderId, invoiceUrl: inv.invoice_url });
};

export const config = { path: "/api/create-invoice" };

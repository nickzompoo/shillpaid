// POST /api/create-invoice
// Creates a unique NOWPayments invoice (checkout link) for one listing payment.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// ---- NOWPayments helpers ----
const NP_BASE = process.env.NOWPAYMENTS_SANDBOX === "true"
  ? "https://api-sandbox.nowpayments.io/v1"
  : "https://api.nowpayments.io/v1";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Calls NOWPayments and always returns {ok, status, data, message}.
async function np(path, { method = "GET", body } = {}) {
  let res, data = null;
  try {
    res = await fetch(NP_BASE + path, {
      method,
      headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY || "", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    return { ok: false, status: 0, data: null, message: "Could not reach NOWPayments: " + e.message };
  }
  try { data = await res.json(); } catch {}
  const message = data && (data.message || data.error || data.errors && JSON.stringify(data.errors)) || `HTTP ${res.status}`;
  return { ok: res.ok, status: res.status, data, message: String(message) };
}
// -----------------------------

export default async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!process.env.NOWPAYMENTS_API_KEY)
      return json({ error: "NOWPAYMENTS_API_KEY is not set. Add it in Netlify → Site configuration → Environment variables, then redeploy." }, 500);

    let body = {};
    try { body = await req.json(); } catch {}
    const ticker = String(body.ticker || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase();
    const name = String(body.name || "").slice(0, 60);
    const mint = String(body.mint || "");
    if (!ticker || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return json({ error: "Invalid coin details" }, 400);

    const orderId = "list_" + crypto.randomBytes(12).toString("hex"); // unique per payment
    const site = process.env.URL || new URL(req.url).origin;
    const amount = Number(process.env.LISTING_PRICE_AMOUNT || 0.1);
    const priceCurrency = (process.env.LISTING_PRICE_CURRENCY || "sol").toLowerCase();
    const payCurrency = (process.env.LISTING_PAY_CURRENCY || "sol").toLowerCase();

    const invoice = (price_amount, price_currency) => np("/invoice", {
      method: "POST",
      body: {
        price_amount, price_currency, pay_currency: payCurrency,
        order_id: orderId,
        order_description: `SHILLPAID listing: $${ticker} ${name}`.trim(),
        ipn_callback_url: `${site}/api/nowpayments-ipn`,
        success_url: `${site}/#market`,
        cancel_url: `${site}/#market`
      }
    });

    let r = await invoice(amount, priceCurrency);

    // Some accounts don't accept a crypto price currency. Fall back to the same amount priced in USD.
    if (!r.ok && priceCurrency !== "usd") {
      const est = await np(`/estimate?amount=${amount}&currency_from=${priceCurrency}&currency_to=usd`);
      const usd = est.ok && Number(est.data && est.data.estimated_amount);
      if (usd > 0) {
        const r2 = await invoice(Math.ceil(usd * 100) / 100, "usd");
        if (r2.ok) r = r2; else r = { ...r2, message: `${r.message} / USD fallback: ${r2.message}` };
      }
    }

    if (!r.ok || !r.data || !r.data.invoice_url) {
      console.error("NOWPayments invoice error", r.status, r.data);
      const hint = r.status === 401 || r.status === 403 ? " Check that NOWPAYMENTS_API_KEY is correct and your NOWPayments account is verified." : "";
      return json({ error: `NOWPayments refused the request (${r.status}): ${r.message}.${hint}` }, 502);
    }

    try {
      const store = getStore({ name: "listing-orders", consistency: "strong" });
      await store.setJSON(orderId, {
        orderId, invoiceId: String(r.data.id), ticker, mint,
        status: "waiting", paid: false, createdAt: Date.now()
      });
    } catch (e) {
      console.error("Blobs error", e);
      return json({ error: "Storage error (Netlify Blobs): " + e.message + ". Deploy with Git or the Netlify CLI, not drag-and-drop." }, 500);
    }

    return json({ orderId, invoiceUrl: r.data.invoice_url });
  } catch (e) {
    console.error(e);
    return json({ error: "Server error: " + e.message }, 500);
  }
};

export const config = { path: "/api/create-invoice" };

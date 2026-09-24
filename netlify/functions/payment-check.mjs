// GET /api/payment-check
// Diagnostics: open this URL in a browser to see what's wrong with the payment setup.
// It never shows your keys, only whether they're set and whether NOWPayments accepts them.
import { getStore } from "@netlify/blobs";

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

export default async () => {
  const out = { api: NP_BASE, checks: {} };
  const c = out.checks;
  c.NOWPAYMENTS_API_KEY_set = !!process.env.NOWPAYMENTS_API_KEY;
  c.NOWPAYMENTS_IPN_SECRET_set = !!process.env.NOWPAYMENTS_IPN_SECRET;
  c.site_url = process.env.URL || null;

  const status = await np("/status");
  c.nowpayments_reachable = status.ok ? "yes" : status.message;

  if (c.NOWPAYMENTS_API_KEY_set) {
    const cur = await np("/merchant/coins");
    const coins = cur.ok && cur.data && (cur.data.selectedCurrencies || cur.data.currencies) || null;
    c.api_key_valid = cur.ok ? "yes" : `no (${cur.status}: ${cur.message})`;
    if (coins) c.sol_enabled_in_account = coins.map(x => String(x.code || x).toLowerCase()).includes("sol");
    const min = await np("/min-amount?currency_from=sol&currency_to=sol");
    c.sol_min_amount = min.ok ? min.data && min.data.min_amount : min.message;
    const est = await np("/estimate?amount=0.1&currency_from=sol&currency_to=usd");
    c.estimate_0_1_sol_usd = est.ok ? est.data && est.data.estimated_amount : est.message;
  }

  try {
    const store = getStore({ name: "listing-orders", consistency: "strong" });
    await store.setJSON("_healthcheck", { at: Date.now() });
    c.storage = "ok";
  } catch (e) { c.storage = "error: " + e.message; }

  return json(out);
};

export const config = { path: "/api/payment-check" };

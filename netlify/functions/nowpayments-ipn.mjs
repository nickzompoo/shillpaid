// POST /api/nowpayments-ipn
// NOWPayments calls this when a payment changes status. The signature is checked
// with your IPN secret, so nobody else can mark an order as paid.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const PAID = new Set(["finished", "confirmed", "sending"]);

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return v;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return new Response("Not configured", { status: 500 });

  const raw = await req.text();
  let body;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  const sig = req.headers.get("x-nowpayments-sig") || "";
  const expected = crypto.createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return new Response("Bad signature", { status: 401 });

  const orderId = String(body.order_id || "");
  const store = getStore({ name: "listing-orders", consistency: "strong" });
  const order = orderId ? await store.get(orderId, { type: "json" }) : null;
  if (!order) return new Response("Unknown order", { status: 200 }); // acknowledge so it isn't retried forever

  const status = String(body.payment_status || "");
  await store.setJSON(orderId, {
    ...order,
    status,
    paid: order.paid || PAID.has(status),
    paymentId: body.payment_id ?? order.paymentId ?? null,
    actuallyPaid: body.actually_paid ?? null,
    payCurrency: body.pay_currency ?? null,
    updatedAt: Date.now()
  });
  return new Response("OK", { status: 200 });
};

export const config = { path: "/api/nowpayments-ipn" };

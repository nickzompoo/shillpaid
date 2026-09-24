// GET /api/order-status?id=<orderId>
// The page polls this to find out whether its payment has been confirmed.
import { getStore } from "@netlify/blobs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^list_[a-f0-9]{24}$/.test(id)) return json({ error: "Invalid id" }, 400);
  const store = getStore({ name: "listing-orders", consistency: "strong" });
  const order = await store.get(id, { type: "json" });
  if (!order) return json({ error: "Not found" }, 404);
  return json({ status: order.status, paid: !!order.paid });
};

export const config = { path: "/api/order-status" };

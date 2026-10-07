/* ==========================================================================
   Monumental Recovery Foundation — Taste of Recovery auction payments
   --------------------------------------------------------------------------
   POST /.netlify/functions/auction-checkout   { lotId }   (Authorization: Bearer <guest token>)
     Checks with Supabase that the auction is closed and this guest is the
     high bidder on the lot, then returns a Stripe Checkout URL for that amount.

   GET  /.netlify/functions/auction-checkout?session=cs_...
     Called when the winner lands back in the app. Confirms the session was
     paid with Stripe and marks the lot paid in Supabase.

   Environment variables (Netlify -> Site configuration -> Environment variables):
     STRIPE_SECRET_KEY          same key as the donate page
     SUPABASE_URL               https://<project>.supabase.co
     SUPABASE_SERVICE_ROLE_KEY  Supabase -> Project Settings -> API Keys -> secret key.
                                Server only: never put it in the app or the repo.
   ========================================================================== */

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";
const EVENT = "taste-of-recovery-2027";

exports.handler = async function (event) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !sbUrl || !sbKey) {
    return json(500, { error: "Online payment isn't switched on yet. A staff member can take your payment." });
  }
  const db = supabase(sbUrl, sbKey);

  if (event.httpMethod === "GET") return confirm(event, stripeKey, db);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (err) { return json(400, { error: "We could not read that request." }); }
  const lotId = String(body.lotId || "");
  if (!/^lot-\d{2}$/.test(lotId)) return json(400, { error: "That lot doesn't exist." });

  // Who is asking? Supabase checks the guest's sign-in token.
  const token = String(event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const user = token ? await db.user(token) : null;
  if (!user) return json(401, { error: "Please sign in again to pay." });

  try {
    const [state] = await db.get("event_state?id=eq.1&select=auction,auction_closes_at");
    const closed = state && (state.auction === "closed" ||
      (state.auction === "open" && state.auction_closes_at && Date.now() >= Date.parse(state.auction_closes_at)));
    if (!closed) return json(409, { error: "Bidding hasn't closed yet." });

    const [top] = await db.get(`bids?lot_id=eq.${lotId}&select=guest_id,amount,paddle&order=amount.desc,created_at.asc&limit=1`);
    if (!top || top.guest_id !== user.id) return json(403, { error: "This lot isn't yours to pay for." });

    const [paid] = await db.get(`lots_paid?lot_id=eq.${lotId}&select=lot_id`);
    if (paid) return json(409, { error: "This lot is already paid. Thank you!" });

    const [lot] = await db.get(`lots?id=eq.${lotId}&select=no,title`);
    const [guest] = await db.get(`guests?id=eq.${user.id}&select=name,phone,paddle`);

    const origin = event.headers.origin || (event.headers.host ? "https://" + event.headers.host : "");
    const label = `Lot ${String(lot.no).padStart(2, "0")}: ${lot.title}`;
    const form = new URLSearchParams();
    form.append("mode", "payment");
    form.append("success_url", origin + "/gala/?paid={CHECKOUT_SESSION_ID}#/auction");
    form.append("cancel_url", origin + "/gala/#/auction");
    form.append("line_items[0][quantity]", "1");
    form.append("line_items[0][price_data][currency]", "usd");
    form.append("line_items[0][price_data][unit_amount]", String(top.amount * 100));
    form.append("line_items[0][price_data][product_data][name]", "Taste of Recovery 2027 silent auction: " + label);
    form.append("line_items[0][price_data][product_data][description]", "Winning bid by paddle " + String(top.paddle).padStart(3, "0"));
    form.append("custom_text[submit][message]", "Thank you for bidding. Proceeds fund Monumental Recovery Foundation scholarships.");
    form.append("payment_intent_data[description]", label + " (paddle " + top.paddle + ")");
    [["source", "gala-app"], ["event", EVENT], ["kind", "auction_lot"], ["lot", lotId], ["guest", user.id],
     ["paddle", String(top.paddle)], ["name", (guest && guest.name) || ""], ["phone", (guest && guest.phone) || ""]]
      .forEach(function (pair) {
        form.append("metadata[" + pair[0] + "]", pair[1]);
        form.append("payment_intent_data[metadata][" + pair[0] + "]", pair[1]);
      });

    const res = await fetch(STRIPE_API, {
      method: "POST",
      headers: { Authorization: "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Stripe error:", data && data.error);
      return json(502, { error: "Online payment is temporarily unavailable. A staff member can take your payment." });
    }
    return json(200, { url: data.url });
  } catch (err) {
    console.error("Auction checkout failed:", err);
    return json(502, { error: "We couldn't start the payment. Please try again." });
  }
};

/* Back from Stripe: mark the lot paid if the session really was paid. */
async function confirm(event, stripeKey, db) {
  const session = (event.queryStringParameters || {}).session || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(session)) return json(400, { error: "Missing session." });
  try {
    const res = await fetch(STRIPE_API + "/" + session, { headers: { Authorization: "Bearer " + stripeKey } });
    const data = await res.json();
    const meta = (res.ok && data.metadata) || {};
    if (data.payment_status !== "paid" || meta.event !== EVENT || meta.kind !== "auction_lot") return json(200, { paid: null });
    await db.upsert("lots_paid", { lot_id: meta.lot, method: "card", stripe_session: session });
    return json(200, { paid: meta.lot });
  } catch (err) {
    console.error("Payment confirm failed:", err);
    return json(502, { error: "Could not confirm the payment." });
  }
}

/* Minimal Supabase REST client using the service key (bypasses row-level security). */
function supabase(url, key) {
  // New-style secret keys (sb_secret_...) go in the apikey header only.
  const headers = { apikey: key };
  return {
    async user(token) {
      const res = await fetch(url + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token } });
      return res.ok ? res.json() : null;
    },
    async get(path) {
      const res = await fetch(url + "/rest/v1/" + path, { headers });
      if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()));
      return res.json();
    },
    async upsert(table, row) {
      const res = await fetch(url + "/rest/v1/" + table, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, headers),
        body: JSON.stringify(row)
      });
      if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()));
    }
  };
}

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(payload)
  };
}

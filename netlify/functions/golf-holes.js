/* ==========================================================================
   Monumental Recovery Foundation — Taste of Recovery golf holes
   --------------------------------------------------------------------------
   GET /.netlify/functions/golf-holes  ->  { "sold": [3, 7, 12] }

   Lists the holes whose $500 sponsorship has been paid, so the event page can
   turn them gold and stop them being picked again. Uses the same
   STRIPE_SECRET_KEY as the donate page.

   Stripe's search index can lag a payment by up to a minute, so when a sponsor
   lands back on the page with ?hole_session=cs_..., that Checkout session is
   checked directly and its hole is included straight away.
   ========================================================================== */

const { soldHoles, HOLE_EVENT } = require("./create-checkout-session");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed." });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return json(200, { sold: [] });
  }

  const sold = await soldHoles(key);
  if (sold === null) {
    return json(502, { error: "Could not load hole sponsorships." });
  }

  const session = (event.queryStringParameters || {}).session || "";
  let justPaid = null;
  if (/^cs_[A-Za-z0-9_]+$/.test(session)) {
    try {
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + session, {
        headers: { Authorization: "Bearer " + key }
      });
      const data = await res.json();
      const meta = (res.ok && data.metadata) || {};
      if (data.payment_status === "paid" && meta.event === HOLE_EVENT && meta.kind === "hole_sponsorship") {
        justPaid = Number(meta.hole);
        if (justPaid && !sold.includes(justPaid)) sold.push(justPaid);
      }
    } catch (err) {
      console.error("Session lookup failed:", err);
    }
  }

  return json(200, { sold: sold.sort(function (a, b) { return a - b; }), justPaid: justPaid });
};

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(payload)
  };
}

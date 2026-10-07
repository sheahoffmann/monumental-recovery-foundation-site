/* ==========================================================================
   Monumental Recovery Foundation — Stripe Checkout session
   --------------------------------------------------------------------------
   Creates a Stripe Checkout session and hands the URL back to the donate page.

   Requires ONE environment variable, set in Netlify:
     Site configuration -> Environment variables -> Add a variable
       Key:   STRIPE_SECRET_KEY
       Value: sk_test_... while testing, sk_live_... when you go live

   No npm packages, no build step — it calls the Stripe REST API directly, so
   it works with a drag-and-drop deploy. The secret key never reaches the
   browser; it is read here, on Netlify's server, at request time.
   ========================================================================== */

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";

const MIN_USD = 1;
const MAX_USD = 50000;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return json(500, {
      error: "Online giving is not switched on yet. Please email give@monumentalrecovery.org."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return json(400, { error: "We could not read that request." });
  }

  if (body.kind === "hole") {
    return holeSponsorship(event, body, key);
  }

  const dollars = Number(body.amount);
  if (!isFinite(dollars) || dollars < MIN_USD || dollars > MAX_USD) {
    return json(400, {
      error: "Please enter an amount between $" + MIN_USD + " and $" + MAX_USD.toLocaleString() + "."
    });
  }

  const cents = Math.round(dollars * 100);
  const monthly = body.monthly === true;
  const origin =
    event.headers.origin ||
    (event.headers.host ? "https://" + event.headers.host : "");

  const form = new URLSearchParams();
  form.append("mode", monthly ? "subscription" : "payment");
  form.append("success_url", origin + "/donation-thank-you.html?session_id={CHECKOUT_SESSION_ID}");
  form.append("cancel_url", origin + "/donate.html");
  form.append("billing_address_collection", "required");
  form.append("line_items[0][quantity]", "1");
  form.append("line_items[0][price_data][currency]", "usd");
  form.append("line_items[0][price_data][unit_amount]", String(cents));
  form.append(
    "line_items[0][price_data][product_data][name]",
    monthly
      ? "Monthly gift — Monumental Recovery Foundation"
      : "Donation — Monumental Recovery Foundation"
  );
  form.append(
    "line_items[0][price_data][product_data][description]",
    "Scholarships for men seeking extended addiction treatment"
  );
  form.append("metadata[source]", "website");

  if (monthly) {
    form.append("line_items[0][price_data][recurring][interval]", "month");
    form.append("subscription_data[metadata][source]", "website");
  } else {
    // renders the Checkout button as "Donate" rather than "Pay"
    form.append("submit_type", "donate");
  }

  try {
    const res = await fetch(STRIPE_API, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const data = await res.json();

    if (!res.ok) {
      // Log the real reason for us; never show Stripe's raw message to a donor.
      console.error("Stripe error:", data && data.error);
      return json(502, {
        error:
          "Online giving is temporarily unavailable. Please try again shortly, " +
          "or email give@monumentalrecovery.org and we will take your gift personally."
      });
    }

    return json(200, { url: data.url });
  } catch (err) {
    console.error("Checkout request failed:", err);
    return json(502, { error: "We could not reach Stripe. Please try again." });
  }
};

/* Taste of Recovery golf hole sponsorship -----------------------------------
   A fixed $500 gift for one of 18 holes. The hole and the sponsoring facility
   are stored as metadata on the payment, which is how netlify/functions/golf-holes.js
   finds the holes that are already taken. */
const HOLE_EVENT = "taste-of-recovery-2027";
const HOLE_USD = 500;

async function holeSponsorship(event, body, key) {
  const hole = Number(body.hole);
  const facility = String(body.facility || "").replace(/\s+/g, " ").trim();
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) {
    return json(400, { error: "Please choose a hole from 1 to 18." });
  }
  if (facility.length < 2 || facility.length > 100) {
    return json(400, { error: "Please enter the name of the sponsoring facility." });
  }

  const taken = await soldHoles(key);
  if (taken === null) {
    return json(502, { error: "We could not check that hole right now. Please try again shortly." });
  }
  if (taken.includes(hole)) {
    return json(409, { error: "Hole " + hole + " has just been sponsored. Please pick another hole.", sold: taken });
  }

  const origin =
    event.headers.origin ||
    (event.headers.host ? "https://" + event.headers.host : "");
  const note = "Hole " + hole + " sponsored by " + facility;

  const form = new URLSearchParams();
  form.append("mode", "payment");
  form.append("submit_type", "donate");
  form.append("success_url", origin + "/taste-of-recovery.html?hole_session={CHECKOUT_SESSION_ID}#golf");
  form.append("cancel_url", origin + "/taste-of-recovery.html#golf");
  form.append("billing_address_collection", "required");
  form.append("line_items[0][quantity]", "1");
  form.append("line_items[0][price_data][currency]", "usd");
  form.append("line_items[0][price_data][unit_amount]", String(HOLE_USD * 100));
  form.append("line_items[0][price_data][product_data][name]", "Taste of Recovery 2027 — Hole " + hole + " sponsorship");
  form.append("line_items[0][price_data][product_data][description]", "Sponsored by " + facility);
  form.append("custom_text[submit][message]", note + ". Proceeds fund Monumental Recovery Foundation scholarships.");
  form.append("payment_intent_data[description]", note);
  [["source", "website"], ["event", HOLE_EVENT], ["kind", "hole_sponsorship"], ["hole", String(hole)], ["facility", facility]]
    .forEach(function (pair) {
      form.append("metadata[" + pair[0] + "]", pair[1]);
      form.append("payment_intent_data[metadata][" + pair[0] + "]", pair[1]);
    });

  try {
    const res = await fetch(STRIPE_API, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Stripe error:", data && data.error);
      return json(502, { error: "Online payment is temporarily unavailable. Please try again shortly, or email give@monumentalrecovery.org." });
    }
    return json(200, { url: data.url });
  } catch (err) {
    console.error("Checkout request failed:", err);
    return json(502, { error: "We could not reach Stripe. Please try again." });
  }
}

/* Holes with a succeeded, unrefunded payment, via Stripe's PaymentIntent search. Returns null on failure. */
async function soldHoles(key) {
  const query = "metadata['event']:'" + HOLE_EVENT + "' AND metadata['kind']:'hole_sponsorship' AND status:'succeeded'";
  try {
    const res = await fetch(
      "https://api.stripe.com/v1/payment_intents/search?limit=100&expand[]=data.latest_charge&query=" + encodeURIComponent(query),
      { headers: { Authorization: "Bearer " + key } }
    );
    const data = await res.json();
    if (!res.ok) { console.error("Stripe search error:", data && data.error); return null; }
    // A refunded payment still reads "succeeded", so skip those: refunding frees the hole.
    return data.data
      .filter(function (pi) { return !(pi.latest_charge && pi.latest_charge.refunded); })
      .map(function (pi) { return Number(pi.metadata.hole); })
      .filter(Boolean);
  } catch (err) {
    console.error("Stripe search failed:", err);
    return null;
  }
}

exports.soldHoles = soldHoles;
exports.HOLE_EVENT = HOLE_EVENT;

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

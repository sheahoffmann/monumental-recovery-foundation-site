/* ==========================================================================
   Monumental Recovery Foundation — application and recommendation uploads
   --------------------------------------------------------------------------
   Receives the Submit Form upload from apply.html and emails it, with every
   file attached, to give@monumentalrecovery.org through Resend.

   Requires ONE environment variable, set in Netlify:
     Site configuration -> Environment variables -> Add a variable
       Key:   RESEND_API_KEY
       Value: re_...   (from resend.com -> API Keys)

   Optional overrides:
       APPLICATION_EMAIL_TO    default give@monumentalrecovery.org
       APPLICATION_EMAIL_FROM  default Monumental Recovery Foundation <applications@monumentalrecovery.org>
                               (must be on a domain verified in Resend)

   No npm packages, no build step — it calls the Resend REST API directly.
   ========================================================================== */

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_TO = "give@monumentalrecovery.org";
const DEFAULT_FROM = "Monumental Recovery Foundation <applications@monumentalrecovery.org>";

// Netlify caps a function request at 6 MB, and the upload arrives base64
// encoded, so the files themselves must stay under about 4.4 MB.
const MAX_TOTAL_BYTES = 4.2 * 1024 * 1024;
const MAX_FILES = 12;
const ALLOWED = /\.(pdf|jpe?g|png|heic|heif|webp|docx?)$/i;

const FALLBACK =
  " You can also email everything to give@monumentalrecovery.org.";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set.");
    return json(500, { error: "Online submission is not switched on yet." + FALLBACK });
  }

  let form;
  try {
    const raw = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    form = await new Request("https://localhost/", {
      method: "POST",
      headers: { "Content-Type": event.headers["content-type"] || event.headers["Content-Type"] || "" },
      body: raw
    }).formData();
  } catch (err) {
    console.error("Could not parse upload:", err);
    return json(400, { error: "We could not read that upload. Please try again." + FALLBACK });
  }

  // Honeypot: real people never see this field.
  if (text(form, "company")) {
    return json(200, { ok: true });
  }

  const role = text(form, "role") === "clinician" ? "clinician" : "applicant";
  const name = text(form, "name");
  const email = text(form, "email");
  const phone = text(form, "phone");
  const applicantName = role === "clinician" ? text(form, "applicant_name") : name;
  const notes = text(form, "notes");

  if (!name || !email || !applicantName) {
    return json(400, { error: "Please fill in your name, email, and the applicant's name." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Please check your email address." });
  }

  const files = form.getAll("files").filter(function (f) {
    return f && typeof f === "object" && f.size > 0;
  });
  if (!files.length) {
    return json(400, { error: "Please attach your completed form." });
  }
  if (files.length > MAX_FILES) {
    return json(400, { error: "Please attach no more than " + MAX_FILES + " files." + FALLBACK });
  }

  let total = 0;
  const attachments = [];
  for (const file of files) {
    const filename = safeName(file.name);
    if (!ALLOWED.test(filename)) {
      return json(400, { error: filename + " is not a PDF, photo, or Word file." });
    }
    total += file.size;
    if (total > MAX_TOTAL_BYTES) {
      return json(413, { error: "Your files are too large to send together." + FALLBACK });
    }
    attachments.push({
      filename: filename,
      content: Buffer.from(await file.arrayBuffer()).toString("base64")
    });
  }

  const subject =
    role === "clinician"
      ? "Clinical recommendation for " + applicantName + " (from " + name + ")"
      : "Scholarship application: " + applicantName;

  const rows = [
    ["Type", role === "clinician" ? "Clinical recommendation" : "Scholarship application"],
    ["Applicant", applicantName]
  ];
  if (role === "clinician") { rows.push(["Clinician", name]); }
  rows.push(["Email", email], ["Phone", phone || "Not given"]);
  if (notes) { rows.push(["Note", notes]); }
  rows.push(["Files attached", attachments.map(function (a) { return a.filename; }).join(", ")]);

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;">' +
    "<p>A new " + (role === "clinician" ? "clinical recommendation" : "scholarship application") +
    " was submitted at monumentalrecovery.org. The completed form is attached.</p>" +
    '<table cellpadding="6" style="border-collapse:collapse;">' +
    rows.map(function (r) {
      return '<tr><td style="font-weight:bold;vertical-align:top;">' + esc(r[0]) +
        "</td><td>" + esc(r[1]).replace(/\n/g, "<br>") + "</td></tr>";
    }).join("") +
    "</table>" +
    '<p style="color:#666;font-size:13px;">Reply to this email to reach ' + esc(name) + " directly.</p>" +
    "</div>";

  const textBody = rows.map(function (r) { return r[0] + ": " + r[1]; }).join("\n");

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.APPLICATION_EMAIL_FROM || DEFAULT_FROM,
        to: [process.env.APPLICATION_EMAIL_TO || DEFAULT_TO],
        reply_to: email,
        subject: subject,
        html: html,
        text: textBody,
        attachments: attachments
      })
    });

    if (!res.ok) {
      // Log the real reason for us; never show the raw provider message.
      console.error("Resend error:", res.status, await res.text());
      return json(502, { error: "We could not send your submission. Please try again shortly." + FALLBACK });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("Email request failed:", err);
    return json(502, { error: "We could not send your submission. Please try again shortly." + FALLBACK });
  }
};

function text(form, field) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

function safeName(name) {
  const cleaned = String(name || "file").replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned.slice(-120) || "file";
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

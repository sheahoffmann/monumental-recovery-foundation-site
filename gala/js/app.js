/* ==========================================================================
   Taste of Recovery 2027 — guest app
   --------------------------------------------------------------------------
   Hash routes (#/auction, #/auction/lot-03, #/vote ...) render into <main>.
   Screens re-render whenever the data layer reports a change, so bids,
   votes and the reveal show up live. Content lives in content.js; all
   reading and writing of data goes through api.js.
   ========================================================================== */

import * as api from "./api.js";
import { EVENT, SCHEDULE, COURSES, CHEFS, LOTS, FEEDBACK } from "./content.js";
import { mountTrophy, engrave } from "./trophy.js";
import { hostHtml, bindHost } from "./host.js";

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");

/* Helpers ---------------------------------------------------------------- */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pad3 = (n) => String(n).padStart(3, "0");
const lotNo = (n) => "Lot " + String(n).padStart(2, "0");
const courseName = (no) => (COURSES.find((c) => c.no === no) || {}).name || "";
const chefFor = (no) => CHEFS.find((c) => c.course === no) || null;
const initials = (name) => name.replace(/^Chef\s+/i, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: EVENT.timezone });

// ?now=2027-06-17T19:30 lets you preview the schedule as if it were that moment (Mountain time).
const nowOverride = (() => {
  const q = new URLSearchParams(location.search).get("now");
  const t = q ? Date.parse(q.length <= 16 ? q + ":00-06:00" : q) : NaN;
  return isFinite(t) ? t - Date.now() : 0;
})();
const clock = () => Date.now() + nowOverride;
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00-06:00`);   // June is MDT

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const ICON = {
  gavel: '<path d="m14 4 6 6M11 7l6 6M12.5 5.5l-5 5M18.5 11.5l-5 5M9 13l-6 6M4 21h9"/>',
  vote: '<path d="M4 13h16v7H4zM8 13V6.5A1.5 1.5 0 0 1 9.5 5h5A1.5 1.5 0 0 1 16 6.5V13"/><path d="m10 9 1.5 1.5L14 8"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  chef: '<path d="M7 14a4 4 0 1 1 2-7.5 4 4 0 0 1 6 0A4 4 0 1 1 17 14v5H7z"/><path d="M7 16h10"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chat: '<path d="M5 5h14v10H9l-4 4z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  out: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 19h14"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
};
const icon = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/* UI state that isn't stored ---------------------------------------------- */
const ui = {
  filter: "all",
  day: null,
  voteDraft: null,     // the dish just tapped, shown while it saves
  voteSaving: false,
  codeError: "",
  voteCode: (() => { try { return sessionStorage.getItem("tor27-vote-code") || ""; } catch (e) { return ""; } })(),
  upload: null,        // { file, url, kind, progress, busy, error }
  feedback: {},
  busy: false,
};

/* Toasts ------------------------------------------------------------------ */
function toast(html, { tone = "", ms = 5000 } = {}) {
  const el = document.createElement("div");
  el.className = "toast " + tone;
  el.innerHTML = html;
  $("#toasts").appendChild(el);
  el.addEventListener("click", (e) => { if (e.target.closest("a")) el.remove(); });
  setTimeout(() => el.remove(), ms);
}

/* Dialogs ------------------------------------------------------------------ */
document.addEventListener("click", (e) => {
  const close = e.target.closest("[data-close]");
  if (close) close.closest("dialog").close();
});
document.querySelectorAll("dialog").forEach((d) => {
  // Tap on the backdrop closes the sheet.
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
});

function confirmSheet({ kicker, title, body, yes }) {
  const d = $("#confirm");
  $("#confirm-k").textContent = kicker;
  $("#confirm-h").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-yes").textContent = yes;
  return new Promise((resolve) => {
    const done = (v) => { d.removeEventListener("close", onClose); $("#confirm-yes").onclick = null; resolve(v); };
    const onClose = () => done(false);
    d.addEventListener("close", onClose);
    $("#confirm-yes").onclick = () => { d.removeEventListener("close", onClose); d.close(); done(true); };
    d.showModal();
  });
}

/* Sign in ----------------------------------------------------------------- */
let afterSignIn = null;
let pendingPhone = null;

function openSignIn(then) {
  afterSignIn = then || null;
  const d = $("#signin");
  $("#signin-phone").hidden = false;
  $("#signin-code").hidden = true;
  d.querySelectorAll(".error").forEach((e) => (e.hidden = true));
  d.showModal();
  setTimeout(() => $("#si-name").focus(), 50);
}

function showError(form, msg) {
  const e = form.querySelector(".error");
  e.textContent = msg;
  e.hidden = !msg;
}

$("#signin-phone").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector("button:not([type])");
  btn.disabled = true;
  showError(f, "");
  try {
    const res = await api.requestCode(f.name.value, f.phone.value);
    if (res.guest) { signedIn(res.guest); return; }   // no text code needed
    pendingPhone = res.phone;
    $("#si-sent").textContent = `We sent a code to ${api.formatPhone(res.phone)}.`;
    const demo = $("#si-demo");
    demo.hidden = !res.demoCode;
    if (res.demoCode) demo.innerHTML = `Demo mode, no text sent. Your code is <b>${esc(res.demoCode)}</b>`;
    f.hidden = true;
    $("#signin-code").hidden = false;
    $("#si-code").value = "";
    $("#si-code").focus();
  } catch (err) {
    showError(f, err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#signin-code").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector("button:not([type])");
  btn.disabled = true;
  showError(f, "");
  try {
    signedIn(await api.verifyCode(pendingPhone, f.code.value));
  } catch (err) {
    showError(f, err.message);
  } finally {
    btn.disabled = false;
  }
});
function signedIn(guest) {
  $("#signin").close();
  toast(`Welcome, ${esc(guest.name.split(" ")[0])}. You're <b>Paddle ${pad3(guest.paddle)}</b>.`);
  const then = afterSignIn;
  afterSignIn = null;
  if (then) then();
}

// Until texting is switched on, guests join with name and number only.
if (api.SIGN_IN === "anonymous") {
  $("#signin-h").textContent = "Join with your name and number";
  $("#signin-phone .dim").textContent = "Your number is only used for this event: auction results and reaching you if you win.";
  $("#signin-phone button:not([type])").textContent = "Join";
}

$("#si-code").addEventListener("input", (e) => { if (e.target.value.replace(/\D/g, "").length === 6) e.target.form.requestSubmit(); });
$("#si-back").addEventListener("click", () => { $("#signin-code").hidden = true; $("#signin-phone").hidden = false; });

const requireGuest = (then) => { if (api.me()) then(); else openSignIn(then); };

/* Schedule maths ------------------------------------------------------------ */
function timeline() {
  return SCHEDULE.flatMap((d) => d.items.map((it) => ({ ...it, day: d, from: at(d.date, it.start), to: at(d.date, it.end) })));
}
function nowNext() {
  const t = clock();
  const all = timeline();
  const now = all.filter((i) => i.from <= t && t < i.to).sort((a, b) => (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0) || b.from - a.from)[0] || null;
  const next = all.filter((i) => i.from > t).sort((a, b) => a.from - b.from)[0] || null;
  return { now, next };
}
function todayId() {
  const t = clock();
  const d = SCHEDULE.find((day) => t >= at(day.date, "00:00") && t < at(day.date, "23:59"));
  return d ? d.id : "thu";
}

/* ==========================================================================
   Screens
   ========================================================================== */

function screenHome() {
  const s = api.eventState();
  const guest = api.me();
  const lots = api.lots();
  const wins = api.myWins().filter((l) => !l.paid);
  const outbid = s.auction === "open" ? lots.filter((l) => l.mine === "outbid") : [];
  const winning = s.auction === "open" ? lots.filter((l) => l.mine === "winning") : [];

  let status;
  if (s.reveal) {
    const chef = chefFor(s.reveal.course);
    status = `
      <div class="card hl status-card">
        <p class="mono gold">2027 Champion</p>
        <h2>${esc(chef ? chef.name : "Course " + s.reveal.course)}</h2>
        <p class="dim">${esc(chef ? chef.program : "")}${chef && chef.program ? " · " : ""}Course ${s.reveal.course}: ${esc(courseName(s.reveal.course))}</p>
        <div class="row"><a class="btn btn-silver btn-sm" href="#/vote">See the results</a><a class="btn btn-ghost btn-sm" href="#/chefs">Meet every chef</a></div>
      </div>`;
  } else if (s.voting === "open") {
    const mine = api.myVote();
    status = `
      <div class="card hl status-card">
        <p class="mono gold">Voting is open</p>
        <h2>${mine ? "Your vote is in" : "Which plate was best?"}</h2>
        <p class="dim">${mine ? `You voted for course ${mine}: ${esc(courseName(mine))}. You can change it until voting closes.` : "Pick your favorite of the ten courses. One vote per guest."}</p>
        <div class="row"><a class="btn btn-silver btn-sm" href="#/vote">${mine ? "Change my vote" : "Vote now"}</a></div>
      </div>`;
  } else if (s.voting === "closed") {
    status = `
      <div class="card hl status-card">
        <p class="mono gold">Ballots are in</p>
        <h2>Counting the votes</h2>
        <p class="dim">The chefs are about to be revealed. Keep this screen open to see the trophy engraved.</p>
      </div>`;
  } else {
    const { now, next } = nowNext();
    const start = Date.parse(EVENT.galaStart);
    if (now || (next && clock() > at(SCHEDULE[0].date, "00:00"))) {
      status = `
        <div class="card status-card">
          ${now ? `<p class="mono gold">Happening now</p><h2>${esc(now.title)}</h2><p class="dim">${esc(now.body)}</p>` : ""}
          ${next ? `<p class="mono" style="margin-top:${now ? 14 : 0}px">Up next · ${esc(next.day.label.split("·")[0])} ${esc(next.when)}</p><p style="margin:2px 0 0;font-weight:700">${esc(next.title)}</p>` : ""}
          <div class="row"><a class="btn btn-ghost btn-sm" href="#/schedule">Full schedule</a></div>
        </div>`;
    } else if (clock() < start) {
      status = `
        <div class="card status-card">
          <p class="mono gold">Gala night</p>
          <h2>Thursday, June 17 at 6 PM</h2>
          <div class="countdown" data-countdown="${start}"></div>
        </div>`;
    } else {
      status = `<div class="card status-card"><p class="mono gold">Thank you</p><h2>See you in 2028</h2><p class="dim">Tell us how the night went. It takes a minute.</p><div class="row"><a class="btn btn-silver btn-sm" href="#/feedback">Give feedback</a></div></div>`;
    }
  }

  const winsCard = wins.length ? `
    <div class="card hl">
      <p class="mono gold">You won ${wins.length === 1 ? "a lot" : wins.length + " lots"}</p>
      <h3>${wins.map((l) => esc(l.title)).join(", ")}</h3>
      <p class="dim">Thank you for supporting the Foundation. Pay by card to claim ${wins.length === 1 ? "it" : "them"}.</p>
      <a class="btn btn-gold btn-block" href="#/auction">Pay ${money(wins.reduce((t, l) => t + l.high.amount, 0))}</a>
    </div>` : "";

  const bidsCard = guest && (outbid.length || winning.length) ? `
    <a class="card ${outbid.length ? "warn" : ""}" href="#/auction" style="display:block;text-decoration:none">
      <p class="mono ${outbid.length ? "" : "gold"}">Your bids</p>
      <p style="margin:0;font-weight:700">${winning.length ? `Winning ${winning.length}` : ""}${winning.length && outbid.length ? " · " : ""}${outbid.length ? `<span style="color:var(--warn)">Outbid on ${outbid.length}</span>` : ""}</p>
      <p class="fine" style="margin:4px 0 0">${outbid.length ? "Tap to bid again before bidding closes." : "You're the high bidder. We'll text you if that changes."}</p>
    </a>` : "";

  const installCard = !standalone() ? `
    <div class="card">
      <p class="mono gold">Keep it handy</p>
      <h3>Add this app to your home screen</h3>
      <p class="dim" style="margin:0 0 12px">It opens full-screen like any app, and you'll get outbid alerts.</p>
      ${deferredInstall ? `<button class="btn btn-silver btn-sm" data-action="install">Install the app</button>` : `<a class="btn btn-ghost btn-sm" href="#/install">Show me how</a>`}
    </div>` : "";

  return `
    <section class="hero">
      <div class="trophy-box" id="trophy-home"></div>
      <p class="mono trophy-hint">Drag to spin</p>
      <div class="hero-title">
        <span class="k">Taste of</span>
        <h1>RECOVERY 2027</h1>
        <p class="mono hero-meta">June 16–18 · ${esc(EVENT.venue)} · ${esc(EVENT.city)}</p>
      </div>
    </section>
    <div class="stack" style="margin-top:18px">
      ${status}
      ${winsCard}
      ${bidsCard}
    </div>
    <div class="section-h"><h2>Tonight</h2></div>
    <div class="tiles">
      ${tile("#/auction", "gavel", "Silent auction", `${LOTS.length} lots · ${s.auction === "open" ? "bidding open" : s.auction === "closed" ? "closed" : "opens at doors"}`)}
      ${tile("#/vote", "vote", "Vote", s.reveal ? "Results are in" : s.voting === "open" ? "Open now" : "After the last course")}
      ${tile("#/schedule", "clock", "Schedule", "Three days, hour by hour")}
      ${tile("#/chefs", "chef", "The chefs", s.reveal ? "Revealed" : "Ten kitchens, cooked blind")}
      ${tile("#/photos", "camera", "Photos", "Share the night")}
      ${tile("#/feedback", "chat", "Feedback", s.feedback ? "Five quick questions" : "Opens after the gala")}
    </div>
    <div class="stack" style="margin-top:12px">
      ${installCard}
      <a class="card" href="${esc(EVENT.donateUrl)}" style="display:flex;align-items:center;gap:14px;text-decoration:none">
        ${icon("heart", "tile-ic")}<div><b>Can't win a lot? Give directly.</b><p class="fine" style="margin:0">Every dollar funds scholarships for men in treatment.</p></div>
      </a>
    </div>`;
}
const tile = (href, ic, title, sub) => `<a class="tile" href="${href}">${icon(ic)}<div><b>${esc(title)}</b><span>${esc(sub)}</span></div></a>`;

function auctionStatus(s) {
  if (s.auction === "closed") return "Bidding is closed";
  if (s.auction === "upcoming") return "Bidding opens when doors open";
  return s.auctionClosesAt ? `Bidding open · closes ${fmtTime(s.auctionClosesAt)}` : "Bidding is open";
}

function screenAuction() {
  const s = api.eventState();
  const guest = api.me();
  const all = api.lots();
  const mine = all.filter((l) => l.mine);
  const list = ui.filter === "mine" ? mine : all;
  const wins = api.myWins();

  const winsCard = wins.length ? `
    <div class="card hl" style="margin-bottom:14px">
      <p class="mono gold">Congratulations</p>
      <h3>You won ${wins.length === 1 ? "this lot" : "these lots"}</h3>
      <ul class="history">
        ${wins.map((l) => `<li><span>${esc(l.title)}<br><span class="fine">${lotNo(l.no)} · ${money(l.high.amount)}</span></span>
          ${l.paid ? `<span class="tag win">Paid</span>` : `<button class="btn btn-gold btn-sm" data-action="pay" data-lot="${l.id}">Pay ${money(l.high.amount)}</button>`}</li>`).join("")}
      </ul>
      <p class="fine" style="margin:8px 0 0">A staff member will arrange pickup or delivery details with you.</p>
    </div>` : "";

  return `
    <div class="page-h">
      <p class="mono gold">${esc(auctionStatus(s))}</p>
      <h1>Silent auction</h1>
      <p>${s.auction === "closed" ? "Thank you to everyone who bid." : "Bid from your seat. If someone outbids you, we'll let you know."}</p>
    </div>
    ${winsCard}
    ${guest ? `<div class="chips" role="group" aria-label="Filter lots">
      <button class="chip" data-action="filter" data-v="all" aria-pressed="${ui.filter === "all"}">All lots</button>
      <button class="chip" data-action="filter" data-v="mine" aria-pressed="${ui.filter === "mine"}">My bids${mine.length ? ` · ${mine.length}` : ""}</button>
    </div>` : ""}
    ${list.length ? `<ul class="lot-list">${list.map(lotCard).join("")}</ul>` : `<p class="empty">You haven't bid on anything yet.</p>`}`;
}

function lotCard(l) {
  const tag = l.mine === "winning" ? `<span class="tag win">${api.eventState().auction === "closed" ? "Won" : "Winning"}</span>`
    : l.mine === "outbid" ? `<span class="tag out">Outbid</span>` : "";
  return `<li><a class="lot-card ${l.feature ? "feature" : ""}" href="#/auction/${l.id}">
    <div><p class="mono ${l.feature ? "gold" : ""}" style="margin:0">${lotNo(l.no)} ${tag}</p><h3>${esc(l.title)}</h3><span class="where">${esc(l.where || l.body)}</span></div>
    <div class="bid"><span class="mono">${l.count ? "Current" : "Opening"}</span><b>${money(l.high ? l.high.amount : l.start)}</b><span class="fine">${l.count} bid${l.count === 1 ? "" : "s"}</span></div>
  </a></li>`;
}

function screenLot(id) {
  const l = api.lot(id);
  if (!l) return screenMissing();
  const s = api.eventState();
  const guest = api.me();
  const history = api.bidHistory(id);
  const open = s.auction === "open";
  const leading = l.mine === "winning";
  const steps = [l.min, l.min + l.step, l.min + l.step * 3];

  let action;
  if (!open) {
    action = s.auction === "closed"
      ? (l.mine === "winning"
        ? (l.paid ? `<p class="tag win">Paid · thank you</p>` : `<button class="btn btn-gold btn-block" data-action="pay" data-lot="${l.id}">You won · Pay ${money(l.high.amount)}</button>`)
        : `<p class="dim" style="margin:0">Bidding has closed.</p>`)
      : `<p class="dim" style="margin:0">Bidding opens when doors open at 6 PM on gala night.</p>`;
  } else if (!guest) {
    action = `<button class="btn btn-silver btn-block" data-action="signin">Sign in to bid</button>`;
  } else if (leading) {
    action = `<p class="tag win" style="margin-bottom:10px">You're the high bidder</p><p class="fine" style="margin:0">We'll text you if someone outbids you.</p>`;
  } else {
    action = `
      ${l.mine === "outbid" ? `<p class="tag out" style="margin-bottom:6px">You've been outbid</p>` : ""}
      <div class="quick-bids">${steps.map((a) => `<button class="btn ${a === l.min ? "btn-silver" : "btn-ghost"}" data-action="bid" data-lot="${l.id}" data-amount="${a}">${money(a)}</button>`).join("")}</div>
      <form class="custom-bid" data-form="custom-bid" data-lot="${l.id}">
        <label class="money-input"><span>$</span><input name="amount" type="number" inputmode="numeric" min="${l.min}" step="1" placeholder="${l.min.toLocaleString()} or more" aria-label="Your bid in dollars"></label>
        <button class="btn btn-ghost">Bid</button>
      </form>`;
  }

  return `
    <a class="back" href="#/auction">${icon("back")} All lots</a>
    <div class="card lot-hero ${l.feature ? "hl" : ""}">
      <p class="mono gold">${lotNo(l.no)}${l.where ? " · " + esc(l.where) : ""}</p>
      <h1>${esc(l.title)}</h1>
      <p class="dim" style="margin:0">${esc(l.body)}</p>
      ${l.value ? `<p class="fine" style="margin:8px 0 0">Value ${esc(l.value)}</p>` : ""}
      <div class="price-row">
        <div class="price"><span class="mono">${l.count ? "Current bid" : "Opening bid"}</span><b>${money(l.high ? l.high.amount : l.start)}</b></div>
        <div style="text-align:right"><span class="mono">${l.count} bid${l.count === 1 ? "" : "s"}</span>${l.high ? `<p class="fine" style="margin:2px 0 0">Paddle ${pad3(l.high.paddle)}</p>` : ""}</div>
      </div>
    </div>
    <div class="card">
      ${open && !leading && guest ? `<p class="mono" style="margin:0">Next bid ${money(l.min)} or more</p>` : ""}
      ${action}
    </div>
    ${history.length ? `<div class="card"><p class="mono">Bid history</p><ul class="history">${history.map((b) =>
      `<li><span>Paddle ${pad3(b.paddle)}</span><span>${money(b.amount)} <span class="fine">· ${fmtTime(b.at)}</span></span></li>`).join("")}</ul></div>` : ""}
    <p class="fine" style="margin-top:14px">Bids are binding and can't be withdrawn. Winners pay by card when bidding closes. All proceeds fund Monumental Recovery Foundation scholarships.</p>`;
}

function screenVote() {
  const s = api.eventState();
  const guest = api.me();
  const mine = api.myVote();

  if (s.reveal) {
    const results = api.voteResults() || [];
    const total = results.reduce((t, r) => t + r.votes, 0) || 1;
    const chef = chefFor(s.reveal.course);
    const sorted = [...results].sort((a, b) => b.votes - a.votes || a.no - b.no);
    return `
      <div class="page-h"><p class="mono gold">The results</p><h1>Our 2027 champion</h1></div>
      <div class="trophy-box" id="trophy-vote" style="height:min(40svh,340px)"></div>
      <div class="card hl" style="text-align:center">
        <h2 style="margin-bottom:2px">${esc(chef ? chef.name : "Course " + s.reveal.course)}</h2>
        <p class="dim" style="margin:0">${esc(chef ? chef.program : "")}${chef && chef.program ? " · " : ""}Course ${s.reveal.course}: ${esc(courseName(s.reveal.course))}</p>
      </div>
      <div class="card"><p class="mono">Every course, unmasked</p>
        <ol class="results" style="list-style:none;margin:0;padding:0">
          ${sorted.map((r) => {
            const c = chefFor(r.no);
            return `<li><span class="mono gold">${String(r.no).padStart(2, "0")}</span>
              <span><b>${esc(r.name)}</b>${mine === r.no ? ` <span class="tag gold">Your vote</span>` : ""}<br><span class="fine">${esc(c ? c.name : "")}${c && c.program ? " · " + esc(c.program) : ""}</span></span>
              <span class="mono">${r.votes}</span>
              <span class="bar"><i style="width:${Math.round((r.votes / total) * 100)}%"></i></span></li>`;
          }).join("")}
        </ol>
      </div>`;
  }

  const open = s.voting === "open";
  const draft = ui.voteDraft ?? mine;
  // First vote needs the code announced in the room; after that, switching is free.
  const needCode = open && guest && !mine && !ui.voteCode;
  const intro = open
    ? (mine ? `Your vote: ${courseName(mine)}. Tap a different dish to switch. Whatever is selected when voting ends is your final vote.` : "Tap the dish you loved most. You can switch until voting ends. One vote per guest.")
    : s.voting === "closed" ? "Ballots are closed. The chefs are revealed in a few minutes."
    : "Voting opens after the final course. These are the ten plates you'll choose from.";

  return `
    <div class="page-h">
      <p class="mono gold">${open ? "Voting is open" : s.voting === "closed" ? "Voting closed" : "No names. Just the plate."}</p>
      <h1>Vote for your favorite</h1>
      <p>${esc(needCode ? "Listen for the 4-digit voting code announced in the room, enter it here, then tap your favorite dish." : intro)}</p>
    </div>
    ${needCode ? `<div class="card hl code-gate">
      <p class="mono gold" style="margin:0">Voting code</p>
      <form data-form="vote-code" novalidate>
        <input class="field" name="code" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="····" aria-label="Voting code">
        <button class="btn btn-silver">Enter</button>
      </form>
      <p class="error" ${ui.codeError ? "" : "hidden"}>${esc(ui.codeError)}</p>
    </div>` : ""}
    <ul class="ballot ${needCode ? "locked" : ""}" role="radiogroup" aria-label="Courses">
      ${COURSES.map((c) => `<li>
        <input type="radio" name="ballot" id="b-${c.no}" value="${c.no}" ${draft === c.no ? "checked" : ""} ${open ? "" : "disabled"}>
        <label for="b-${c.no}"><span class="n">${String(c.no).padStart(2, "0")}</span><span class="name">${esc(c.name)}</span>${
          draft === c.no ? `<span class="tag gold">${ui.voteSaving ? "Saving…" : "Your vote"}</span>` : open ? `<span class="ring"></span>` : ""}</label>
      </li>`).join("")}
    </ul>
    ${open && !guest ? `<div class="sticky-cta"><button class="btn btn-silver btn-block" data-action="signin">Sign in to vote</button></div>` : ""}`;
}

function screenChefs() {
  const s = api.eventState();
  const revealed = Boolean(s.reveal);
  const chefs = revealed ? [...CHEFS].sort((a, b) => a.course - b.course) : CHEFS;
  return `
    <div class="page-h">
      <p class="mono gold">${revealed ? "Unmasked" : "Ten kitchens"}</p>
      <h1>The chefs</h1>
      <p>${revealed ? "Here's who cooked what." : "Every one of them cooks three meals a day for people in treatment. Who made which course stays secret until the reveal."}</p>
    </div>
    <div class="stack">
      ${chefs.map((c) => {
        const champ = revealed && s.reveal.course === c.course;
        return `<article class="card chef ${champ ? "hl" : ""}">
          <div class="avatar">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : esc(initials(c.name) || "?")}</div>
          <div>
            <h3>${esc(c.name)}</h3>
            <span class="fine">${esc(c.program)}${c.city ? " · " + esc(c.city) : ""}</span>
            <p>${esc(c.bio)}</p>
            ${revealed ? `<span class="tag ${champ ? "now" : "gold"}">${champ ? "Champion · " : ""}Course ${c.course}: ${esc(courseName(c.course))}</span>` : `<span class="tag">Course revealed at the close</span>`}
          </div>
        </article>`;
      }).join("")}
    </div>`;
}

function screenSchedule() {
  const day = SCHEDULE.find((d) => d.id === (ui.day || todayId())) || SCHEDULE[1];
  const t = clock();
  const { now, next } = nowNext();
  return `
    <div class="page-h"><p class="mono gold">June 16–18, 2027</p><h1>Schedule</h1><p>All times Mountain. Details may shift on the night; this page updates.</p></div>
    <div class="day-tabs" role="tablist" aria-label="Event days">
      ${SCHEDULE.map((d) => `<button role="tab" aria-selected="${d.id === day.id}" data-action="day" data-v="${d.id}"><span class="d">${esc(d.label)}</span><span class="n">${esc(d.name)}</span></button>`).join("")}
    </div>
    <ol class="timeline" role="tabpanel">
      ${day.items.map((it) => {
        const from = at(day.date, it.start), to = at(day.date, it.end);
        const isNow = now && now.title === it.title && now.day.id === day.id;
        const isNext = next && next.title === it.title && next.day.id === day.id;
        return `<li class="${it.highlight ? "hl" : ""} ${to < t ? "past" : ""}">
          <span class="when">${esc(it.when)}</span>
          <div>${isNow ? `<span class="tag now" style="margin-bottom:6px">Now</span>` : isNext ? `<span class="tag gold" style="margin-bottom:6px">Up next</span>` : ""}
          <h3>${esc(it.title)}</h3><p>${esc(it.body)}</p></div>
        </li>`;
      }).join("")}
    </ol>`;
}

function screenPhotos() {
  const guest = api.me();
  const items = api.media();
  const u = ui.upload;

  let uploader;
  if (!guest) {
    uploader = `<button class="drop" data-action="signin">${icon("camera")} Sign in to share photos and videos</button>`;
  } else if (u) {
    uploader = `
      <div class="card uploader">
        ${u.kind === "video" ? `<video class="preview" src="${u.url}" controls playsinline muted></video>` : `<img class="preview" src="${u.url}" alt="Your photo">`}
        <label class="lbl" for="cap" style="margin:0">Caption <span class="fine">(optional)</span></label>
        <input class="field" id="cap" name="caption" maxlength="140" placeholder="Course 5 was unreal" value="${esc(u.caption || "")}" ${u.busy ? "disabled" : ""}>
        ${u.busy ? `<div class="progress" aria-label="Uploading"><i style="width:${Math.round(u.progress * 100)}%"></i></div>` : ""}
        ${u.error ? `<p class="error">${esc(u.error)}</p>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-ghost" data-action="upload-cancel" ${u.busy ? "disabled" : ""}>Cancel</button>
          <button class="btn btn-silver" data-action="upload-send" ${u.busy ? "disabled" : ""}>${u.busy ? "Sharing…" : "Share"}</button>
        </div>
      </div>`;
  } else {
    uploader = `<label class="drop">${icon("upload")} Add a photo or video<input type="file" accept="image/*,video/*" data-action="upload-pick" class="sr-only"></label>
      <p class="fine" style="margin:8px 0 0">Photos up to ${api.MAX_IMAGE_MB} MB, videos up to ${api.MAX_VIDEO_MB} MB. A staff member approves each one before it appears for everyone.</p>`;
  }

  return `
    <div class="page-h"><p class="mono gold">Share the night</p><h1>Photos &amp; videos</h1></div>
    ${uploader}
    <div class="section-h"><h2>From the room</h2><span class="mono">${items.filter((m) => m.status === "approved").length}</span></div>
    ${items.length ? `<div class="gallery">${items.map((m) => `
      <button data-action="view-media" data-id="${m.id}" aria-label="${m.kind === "video" ? "Video" : "Photo"} from ${esc(m.by)}${m.caption ? ": " + esc(m.caption) : ""}">
        ${m.kind === "video" ? `<video data-media="${m.id}" muted playsinline preload="metadata"></video>${icon("play", "play")}` : `<img data-media="${m.id}" alt="" loading="lazy">`}
        ${m.status === "pending" ? `<span class="pending">Awaiting approval</span>` : ""}
      </button>`).join("")}</div>` : `<p class="empty">No photos yet. Be the first.</p>`}`;
}

function screenFeedback() {
  const s = api.eventState();
  const guest = api.me();
  const done = api.myFeedback();
  const head = `<div class="page-h"><p class="mono gold">After the gala</p><h1>How was the night?</h1><p>Five quick questions help us plan Taste of Recovery 2028.</p></div>`;
  if (done) return head + `<div class="card hl"><h3>Thank you</h3><p class="dim" style="margin:0">Your feedback is in. We read every answer.</p></div>`;
  if (!s.feedback) return head + `<div class="card"><p class="dim" style="margin:0">Feedback opens once the gala wraps up. We'll text you a reminder the next morning.</p></div>`;
  if (!guest) return head + `<button class="btn btn-silver btn-block" data-action="signin">Sign in to answer</button>`;
  const a = ui.feedback;
  return head + `<form data-form="feedback" novalidate>
    ${FEEDBACK.map((q) => {
      if (q.type === "stars") return `<fieldset class="q"><legend>${esc(q.label)}</legend><div class="stars">
        ${[1, 2, 3, 4, 5].map((n) => `<input type="radio" name="${q.id}" id="${q.id}-${n}" value="${n}" ${a[q.id] == n ? "checked" : ""}><label for="${q.id}-${n}" class="${a[q.id] >= n ? "on" : ""}" aria-label="${n} star${n > 1 ? "s" : ""}">${icon("star")}</label>`).join("")}
      </div></fieldset>`;
      if (q.type === "choice") return `<fieldset class="q"><legend>${esc(q.label)}</legend><div class="options">
        ${q.options.map((o, i) => `<input type="radio" name="${q.id}" id="${q.id}-${i}" value="${esc(o)}" ${a[q.id] === o ? "checked" : ""}><label for="${q.id}-${i}">${esc(o)}</label>`).join("")}
      </div></fieldset>`;
      return `<div class="q"><label class="lbl" for="${q.id}" style="margin-top:0">${esc(q.label)}${q.optional ? ` <span class="fine">(optional)</span>` : ""}</label>
        <textarea class="field" id="${q.id}" name="${q.id}" maxlength="1000">${esc(a[q.id] || "")}</textarea></div>`;
    }).join("")}
    <p class="error" hidden></p>
    <button class="btn btn-silver btn-block">Send feedback</button>
  </form>`;
}

function screenMore() {
  const guest = api.me();
  const row = (href, ic, label) => `<li><a href="${href}">${icon(ic)}${esc(label)}${icon("chev", "chev")}</a></li>`;
  return `
    <div class="page-h">
      <p class="mono gold">${guest ? `Paddle ${pad3(guest.paddle)}` : "Guest"}</p>
      <h1>${guest ? esc(guest.name) : "More"}</h1>
      ${guest ? `<p>${esc(api.formatPhone(guest.phone))}</p>` : ""}
    </div>
    <ul class="menu-list">
      ${row("#/schedule", "clock", "Schedule")}
      ${row("#/chefs", "chef", "The chefs")}
      ${row("#/feedback", "chat", "Feedback")}
      ${standalone() ? "" : row("#/install", "phone", "Add to home screen")}
      ${row(EVENT.donateUrl, "heart", "Donate to the Foundation")}
    </ul>
    <ul class="menu-list" style="margin-top:14px">
      ${guest ? `<li><button data-action="signout">${icon("out")}Sign out</button></li>` : `<li><button data-action="signin">${icon("phone")}Sign in</button></li>`}
    </ul>
    <p class="fine" style="margin-top:18px">Taste of Recovery is a Monumental Recovery Foundation event. Proceeds fund scholarships for men seeking extended addiction treatment.</p>
    <p style="margin-top:22px;text-align:center">${api.isStaff()
      ? `<a class="link-btn" href="#/host">Host controls</a>`
      : `<button class="link-btn" style="color:var(--faint)" data-action="staff-signin">Staff sign in</button>`}</p>`;
}

function screenInstall() {
  return `
    <a class="back" href="#/more">${icon("back")} Back</a>
    <div class="page-h"><p class="mono gold">Two taps</p><h1>Add to your home screen</h1><p>The app then opens full-screen from its own icon, with no app store needed.</p></div>
    ${deferredInstall ? `<button class="btn btn-silver btn-block" data-action="install" style="margin-bottom:14px">Install the app</button>` : ""}
    <div class="card"><p class="mono gold">iPhone · Safari</p>
      <ol style="margin:0;padding-left:1.2em;line-height:1.8">
        <li>Tap the <b>Share</b> button (the square with an arrow) at the bottom of Safari.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b>. Open the app from your home screen from now on.</li>
      </ol>
      <p class="fine" style="margin:10px 0 0">Using Chrome on iPhone? Tap the share icon in the address bar, then Add to Home Screen.</p>
    </div>
    <div class="card"><p class="mono gold">Android · Chrome</p>
      <ol style="margin:0;padding-left:1.2em;line-height:1.8">
        <li>Tap the <b>⋮</b> menu in the top corner.</li>
        <li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
      </ol>
    </div>`;
}

function screenHost() {
  if (!api.isStaff()) {
    return `<div class="empty"><h2>Staff only</h2><p>Sign in with a staff account to see the host controls.</p>
      <button class="btn btn-silver" data-action="staff-signin">Staff sign in</button></div>`;
  }
  return hostHtml();
}

function screenMissing() {
  return `<div class="empty"><h2>Not found</h2><p>That page doesn't exist.</p><a class="btn btn-ghost" href="#/">Go home</a></div>`;
}

/* ==========================================================================
   Router + rendering
   ========================================================================== */

const ROUTES = {
  "": [screenHome, "home"],
  auction: [screenAuction, "auction"],
  vote: [screenVote, "vote"],
  photos: [screenPhotos, "photos"],
  more: [screenMore, "more"],
  schedule: [screenSchedule, "more"],
  chefs: [screenChefs, "more"],
  feedback: [screenFeedback, "more"],
  install: [screenInstall, "more"],
  host: [screenHost, "host"],
};

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "auction" && parts[1]) return { fn: () => screenLot(parts[1]), tab: "auction", key: "lot:" + parts[1] };
  const r = ROUTES[parts[0] || ""];
  return r ? { fn: r[0], tab: r[1], key: parts[0] || "" } : { fn: screenMissing, tab: "", key: "404" };
}

let lastKey = null;
let deferred = false;

function render(force = false) {
  const r = route();
  const sameScreen = r.key === lastKey;
  // Don't yank the screen out from under someone typing; catch up when they're done.
  if (sameScreen && !force && (ui.busy || (document.activeElement && view.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)))) {
    deferred = true;
    return;
  }
  deferred = false;
  view.innerHTML = r.fn();
  lastKey = r.key;
  document.querySelectorAll(".tabbar a").forEach((a) => { if (a.dataset.tab === r.tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (!sameScreen) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }

  const box = view.querySelector(".trophy-box");
  if (box) mountTrophy(box);
  hydrateMedia();
  tickCountdowns();
  renderChrome();
}

function renderChrome() {
  const guest = api.me();
  const who = $("#who");
  who.innerHTML = guest ? `Paddle <b>${pad3(guest.paddle)}</b>` : "Sign in";
  const s = api.eventState();
  const lots = api.lots();
  const alert = s.auction === "open" ? lots.filter((l) => l.mine === "outbid").length : api.myWins().filter((l) => !l.paid).length;
  const ba = $("#badge-auction");
  ba.hidden = !alert; ba.textContent = alert;
  const bv = $("#badge-vote");
  const needVote = s.voting === "open" && guest && !api.myVote();
  bv.hidden = !needVote; bv.textContent = "1";
  $("#tab-host").hidden = !api.isStaff();
  $("#demo-bar").hidden = !api.DEMO;
  $("#demo-admin").href = "admin.html" + location.search;   // keeps ?demo=1
}

view.addEventListener("focusout", () => { setTimeout(() => { if (deferred) render(); }, 0); });

async function hydrateMedia() {
  for (const el of view.querySelectorAll("[data-media]")) {
    const url = await api.mediaUrl(el.dataset.media);
    if (url) el.src = url + (el.tagName === "VIDEO" ? "#t=0.1" : "");
  }
}

function tickCountdowns() {
  view.querySelectorAll("[data-countdown]").forEach((el) => {
    let s = Math.max(0, Math.floor((Number(el.dataset.countdown) - clock()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    el.innerHTML = [[d, "Days"], [h, "Hours"], [m, "Min"], [s, "Sec"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  });
}
setInterval(tickCountdowns, 1000);

/* Actions ------------------------------------------------------------------ */

view.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "INPUT") return;
  const act = el.dataset.action;

  if (act === "signin") return openSignIn(render);
  if (act === "staff-signin") return openStaffSignIn();
  if (act === "signout") { await api.signOut(); toast("Signed out."); return; }
  if (act === "filter") { ui.filter = el.dataset.v; return render(); }
  if (act === "day") { ui.day = el.dataset.v; return render(); }
  if (act === "install") return promptInstall();

  if (act === "bid") return bid(el.dataset.lot, Number(el.dataset.amount));

  if (act === "pay") {
    el.disabled = true;
    try {
      const res = await api.payForLot(el.dataset.lot);
      if (res.url) { location.href = res.url; return; }
      toast("Payment recorded. Thank you! <span class='fine'>(Demo: no card charged)</span>");
    } catch (err) { toast(esc(err.message), { tone: "warn" }); el.disabled = false; }
    return;
  }

  if (act === "upload-cancel") { if (ui.upload) URL.revokeObjectURL(ui.upload.url); ui.upload = null; return render(); }
  if (act === "upload-send") return sendUpload();

  if (act === "view-media") return openLightbox(el.dataset.id);
});

view.addEventListener("change", (e) => {
  const t = e.target;
  if (t.name === "ballot") { vote(Number(t.value)); return; }
  if (t.dataset.action === "upload-pick" && t.files && t.files[0]) {
    const file = t.files[0];
    ui.upload = { file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" : "image", progress: 0, busy: false, error: "" };
    render();
    return;
  }
  const form = t.closest("[data-form=feedback]");
  if (form) {
    ui.feedback[t.name] = t.type === "radio" && /^\d$/.test(t.value) ? Number(t.value) : t.value;
    const stars = t.closest(".stars");
    if (stars) stars.querySelectorAll("label").forEach((l, i) => l.classList.toggle("on", i < Number(t.value)));
  }
});
view.addEventListener("input", (e) => {
  if (e.target.id === "cap" && ui.upload) ui.upload.caption = e.target.value;
  if (e.target.closest("[data-form=feedback]") && e.target.tagName === "TEXTAREA") ui.feedback[e.target.name] = e.target.value;
});

view.addEventListener("submit", async (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.dataset.form === "custom-bid") {
    const amount = Number(form.amount.value);
    if (!amount) { form.amount.focus(); return; }
    form.amount.blur();
    return bid(form.dataset.lot, amount);
  }
  if (form.dataset.form === "vote-code") {
    const code = form.code.value.replace(/\D/g, "");
    form.code.blur();
    ui.codeError = "";
    if (code.length !== 4) { ui.codeError = "The code is 4 digits."; renderNow(); return; }
    form.querySelector("button").disabled = true;
    try {
      if (await api.checkVoteCode(code)) {
        ui.voteCode = code;
        try { sessionStorage.setItem("tor27-vote-code", code); } catch (ex) { /* blocked */ }
        toast("You're in. Tap your favorite dish.", { ms: 3000 });
      } else {
        ui.codeError = "That code isn't right. Listen for the code announced in the room.";
      }
    } catch (ex) { ui.codeError = ex.message; }
    renderNow();
    return;
  }
  if (form.dataset.form === "feedback") {
    const missing = FEEDBACK.filter((q) => !q.optional && !ui.feedback[q.id]);
    const err = form.querySelector(".error");
    if (missing.length) { err.textContent = "Please answer: " + missing.map((q) => q.label.replace(/\?$/, "")).join("; ") + "."; err.hidden = false; return; }
    try {
      await api.submitFeedback({ ...ui.feedback });
      ui.feedback = {};
      toast("Thank you for the feedback.");
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  }
});

/* Tapping a dish is the vote: it saves straight away, and tapping another replaces it. */
function vote(courseNo) {
  if (!api.me()) { render(); openSignIn(() => vote(courseNo)); return; }
  ui.voteDraft = courseNo;
  ui.voteSaving = true;
  renderNow();
  api.castVote(courseNo, ui.voteCode)
    .then(() => toast(`Your vote: <b>${esc(courseName(courseNo))}</b>. Tap another dish to switch.`, { ms: 3000 }))
    .catch((err) => {
      if (/code/i.test(err.message)) { ui.voteCode = ""; try { sessionStorage.removeItem("tor27-vote-code"); } catch (e) { /* blocked */ } }
      toast(esc(err.message), { tone: "warn" });
    })
    .finally(() => { ui.voteDraft = null; ui.voteSaving = false; renderNow(); });
}

async function bid(lotId, amount) {
  requireGuest(async () => {
    const l = api.lot(lotId);
    if (!l) return;
    const ok = await confirmSheet({
      kicker: lotNo(l.no),
      title: `Bid ${money(amount)} on ${l.title}?`,
      body: "If you're the highest bidder when bidding closes, you'll pay this amount by card. Bids can't be withdrawn.",
      yes: `Place ${money(amount)} bid`,
    });
    if (!ok) return;
    ui.busy = true;
    try {
      await api.placeBid(lotId, amount);
      ui.busy = false;
      toast(`You're the high bidder on ${esc(l.title)} at ${money(amount)}.`);
    } catch (err) {
      ui.busy = false;
      toast(esc(err.message), { tone: "warn" });
    }
    render();
  });
}

async function sendUpload() {
  const u = ui.upload;
  if (!u) return;
  u.busy = true; u.error = "";
  ui.busy = true;
  renderNow();
  try {
    await api.uploadMedia(u.file, u.caption, (p) => {
      u.progress = p;
      const bar = view.querySelector(".progress i");
      if (bar) bar.style.width = Math.round(p * 100) + "%";
    });
    URL.revokeObjectURL(u.url);
    ui.upload = null;
    toast("Shared. It'll appear for everyone once a staff member approves it.");
  } catch (err) {
    u.busy = false; u.error = err.message;
  }
  ui.busy = false;
  renderNow();
}
/** Re-render right away, even mid-upload or with a field focused, keeping the scroll position. */
function renderNow() { render(true); }

async function openLightbox(id) {
  const m = api.media().find((x) => x.id === id);
  if (!m) return;
  const url = await api.mediaUrl(id);
  $("#lightbox-body").innerHTML = (m.kind === "video"
    ? `<video class="media" src="${url}" controls autoplay playsinline></video>`
    : `<img class="media" src="${url}" alt="${esc(m.caption || "Photo from the gala")}">`)
    + `<div class="cap"><b>${esc(m.by)}</b>${m.caption ? ` · ${esc(m.caption)}` : ""}${m.status === "pending" ? ` <span class="tag">Awaiting approval</span>` : ""}</div>`;
  const d = $("#lightbox");
  d.addEventListener("close", () => { $("#lightbox-body").innerHTML = ""; }, { once: true });
  d.showModal();
}

/* Staff sign in: a second, separate login that adds the Host tab ----------- */
function openStaffSignIn() {
  const d = $("#staff-signin");
  const f = $("#staff-form");
  f.reset();
  showError(f, "");
  const note = $("#st-demo");
  note.hidden = !api.DEMO;
  if (api.DEMO) note.innerHTML = `Demo mode: any email, password <b>${esc(api.DEMO_ADMIN_PIN)}</b>`;
  d.showModal();
  setTimeout(() => $("#st-email").focus(), 50);
}
$("#staff-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector("button:not([type])");
  btn.disabled = true;
  showError(f, "");
  try {
    await api.staffSignIn(f.email.value, f.password.value);
    $("#staff-signin").close();
    toast("Signed in as staff. The Host tab is ready.");
    location.hash = "#/host";
  } catch (err) {
    showError(f, err.message);
  } finally {
    btn.disabled = false;
  }
});
bindHost(view, (msg, tone) => toast(esc(msg), { tone }), () => { toast("Signed out of staff."); location.hash = "#/more"; });

$("#who").addEventListener("click", () => { if (api.me()) location.hash = "#/more"; else openSignIn(render); });

/* Install prompt (Android / desktop Chrome) ------------------------------- */
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; render(); });
async function promptInstall() {
  if (!deferredInstall) { location.hash = "#/install"; return; }
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null;
  render();
}

/* Live alerts: outbid, auction closed, winner revealed --------------------- */
let prev = null;
function snapshot() {
  const s = api.eventState();
  return { mine: Object.fromEntries(api.lots().map((l) => [l.id, l.mine])), reveal: s.reveal ? s.reveal.course : null, auction: s.auction, voting: s.voting, guest: (api.me() || {}).id };
}
function watch() {
  const cur = snapshot();
  if (prev && prev.guest === cur.guest) {
    for (const l of LOTS) {
      if (prev.mine[l.id] === "winning" && cur.mine[l.id] === "outbid" && cur.auction === "open") {
        toast(`Outbid on ${esc(l.title)}. <a href="#/auction/${l.id}">Bid again</a>`, { tone: "warn", ms: 9000 });
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
    }
    if (prev.auction === "open" && cur.auction === "closed") {
      const wins = api.myWins();
      toast(wins.length ? `Bidding closed. You won ${wins.length === 1 ? "a lot" : wins.length + " lots"}! <a href="#/auction">Pay now</a>` : "Bidding has closed. Thank you for bidding.", { ms: 10000 });
    }
    if (prev.voting !== "open" && cur.voting === "open") {
      toast(`Voting is open. Listen for the code. <a href="#/vote">Vote now</a>`, { ms: 12000 });
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    }
    if (!prev.reveal && cur.reveal) {
      const chef = chefFor(cur.reveal);
      engrave(chef ? chef.name : "Course " + cur.reveal, true, chef ? chef.program : "");
      if (route().key !== "" && route().key !== "vote") location.hash = "#/";
      toast(`We have a champion: <b>${esc(chef ? chef.name : "Course " + cur.reveal)}</b>`, { ms: 10000 });
    }
  }
  if (prev && prev.reveal && !cur.reveal) engrave("Awaiting champion", false);
  prev = cur;
}

api.subscribe(() => { watch(); render(); });
window.addEventListener("hashchange", () => render());

// First paint.
{
  const s = api.eventState();
  if (s.reveal) { const chef = chefFor(s.reveal.course); engrave(chef ? chef.name : "Course " + s.reveal.course, false, chef ? chef.program : ""); }
  watch();
  render();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

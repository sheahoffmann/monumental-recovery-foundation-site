/* ==========================================================================
   Taste of Recovery app — live backend (Supabase)
   --------------------------------------------------------------------------
   Same functions as api-demo.js. Data is loaded into memory on start and
   kept current through Supabase Realtime, so the screens can read it
   synchronously and re-render whenever anything changes. Every write goes
   through the database functions in supabase/schema.sql, which enforce the
   rules (auction open, minimum raise, one vote each).

   Phones drop their connection when they sleep, so everything is reloaded
   when the app comes back to the foreground or the live feed reconnects.
   ========================================================================== */

import { LOTS, COURSES } from "./content.js";
import { normalizePhone, formatPhone, prepareImage } from "./util.js";
export { normalizePhone, formatPhone };

export const DEMO = false;
export let SIGN_IN = "anonymous";
export const MAX_IMAGE_MB = 15;
export const MAX_VIDEO_MB = 100;
export const DEMO_ADMIN_PIN = null;

const BUCKET = "gala-media";

// Two separate sign-ins on one device: the guest (name + phone) and, for
// staff, an email/password login. Each has its own client and saved session,
// so a host can bid and vote as a guest and run the night from the same phone.
let sb = null;        // guest
let sbStaff = null;   // staff
let cfg = null;
const listeners = new Set();

const cache = {
  user: null,          // guest's Supabase auth user
  guest: null,         // own guests row
  staffUser: null,     // staff login
  staff: false,        // staffUser is listed in public.staff
  state: null,         // event_state row
  rules: {},           // lot id -> { start_bid, step }
  bids: [],            // all bids, oldest first
  paid: {},            // lot id -> paid row
  media: [],           // rows this user may see
  vote: null,
  feedback: null,
  results: null,       // [{ course, votes }] once revealed
  // Staff only
  guests: [],
  votes: [],
  feedbackAll: [],
  mediaAll: [],
  voteCode: "",
  lockedOut: 0,        // guests locked out after five wrong codes
};

class ApiError extends Error {}
const fail = (msg) => { throw new ApiError(msg); };
/** Turn a Supabase error into a message a guest can read. */
function check({ data, error }) {
  if (!error) return data;
  const msg = String(error.message || "");
  if (/Failed to fetch|NetworkError|network/i.test(msg)) fail("Can't reach the server. Check your Wi-Fi or signal and try again.");
  if (/JWT|token|session/i.test(msg)) fail("Your sign-in has expired. Please sign in again.");
  fail(msg || "Something went wrong. Please try again.");
}

/* Start-up ----------------------------------------------------------------- */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

export async function init(config) {
  cfg = config;
  SIGN_IN = config.signIn === "phone" ? "code" : "anonymous";
  await loadScript(new URL("../../assets/vendor/supabase.js", import.meta.url).href);
  const client = (storageKey) => window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { storageKey, persistSession: true, autoRefreshToken: true },
  });
  sb = client("tor27-guest");
  sbStaff = client("tor27-staff");

  const [g, st] = await Promise.all([sb.auth.getSession(), sbStaff.auth.getSession()]);
  cache.user = g.data.session ? g.data.session.user : null;
  cache.staffUser = st.data.session ? st.data.session.user : null;
  const watchAuth = (client, key) => client.auth.onAuthStateChange((event, session) => {
    const id = session ? session.user.id : null;
    const same = id === (cache[key] && cache[key].id);
    cache[key] = session ? session.user : null;
    if (!same || event === "SIGNED_OUT") reloadSoon(true);
  });
  watchAuth(sb, "user");
  watchAuth(sbStaff, "staffUser");

  await withTimeout(loadAll(), 8000).catch((e) => console.warn("Initial load:", e));
  connect();
  if (!/admin\.html$/.test(location.pathname)) confirmReturnFromStripe();

  document.addEventListener("visibilitychange", () => { if (!document.hidden) reloadSoon(true); });
  window.addEventListener("online", () => reloadSoon(true));
  // Safety net in case the live feed silently stops; also applies closing times.
  setInterval(() => reloadSoon(false), 30000);
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

async function loadAll() {
  const uid = cache.user ? cache.user.id : null;
  const [state, rules, bids, paid, media] = await Promise.all([
    sb.from("event_state").select("*").eq("id", 1).maybeSingle(),
    sb.from("lots").select("id,start_bid,step"),
    sb.from("bids").select("id,lot_id,guest_id,paddle,amount,created_at").order("created_at").limit(10000),
    sb.from("lots_paid").select("*"),
    sb.from("media").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (state.data) cache.state = state.data;
  if (rules.data) cache.rules = Object.fromEntries(rules.data.map((r) => [r.id, r]));
  if (bids.data) cache.bids = bids.data;
  if (paid.data) cache.paid = Object.fromEntries(paid.data.map((r) => [r.lot_id, r]));
  if (media.data) cache.media = media.data;

  if (uid) {
    const [g, v, f] = await Promise.all([
      sb.from("guests").select("*").eq("id", uid).maybeSingle(),
      sb.from("votes").select("course").eq("guest_id", uid).maybeSingle(),
      sb.from("feedback").select("*").eq("guest_id", uid).maybeSingle(),
    ]);
    cache.guest = g.data || null;
    cache.vote = v.data ? v.data.course : null;
    cache.feedback = f.data || null;
  } else {
    Object.assign(cache, { guest: null, vote: null, feedback: null });
  }

  cache.results = null;
  if (cache.state && cache.state.reveal_course) {
    const r = await sb.rpc("vote_results");
    if (r.data) cache.results = r.data;
  }

  cache.staff = false;
  if (cache.staffUser) {
    const row = await sbStaff.from("staff").select("user_id").eq("user_id", cache.staffUser.id).maybeSingle();
    cache.staff = Boolean(row.data);
  }
  if (cache.staff) await loadStaff();
  else Object.assign(cache, { guests: [], votes: [], feedbackAll: [], mediaAll: [] });
  notify();
}

async function loadStaff() {
  const [g, v, f, m, c, l] = await Promise.all([
    sbStaff.from("guests").select("*").order("paddle").limit(5000),
    sbStaff.from("votes").select("*").limit(5000),
    sbStaff.from("feedback").select("*").limit(5000),
    sbStaff.from("media").select("*").order("created_at", { ascending: false }).limit(2000),
    sbStaff.from("vote_code").select("code").eq("id", 1).maybeSingle(),
    sbStaff.from("vote_code_tries").select("guest_id").gte("tries", 5),
  ]);
  cache.guests = g.data || [];
  cache.votes = v.data || [];
  cache.feedbackAll = f.data || [];
  cache.mediaAll = m.data || [];
  cache.voteCode = (c.data && c.data.code) || "";
  cache.lockedOut = (l.data || []).length;
}

let reloadTimer = null;
let reconnectNeeded = false;
function reloadSoon(reconnect) {
  if (reconnect) reconnectNeeded = true;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    try { await loadAll(); } catch (e) { console.warn("Reload:", e); }
    if (reconnectNeeded) { reconnectNeeded = false; connect(); }
  }, 250);
}

/* Live feed ------------------------------------------------------------------- */

let channel = null;
let staffChannel = null;
function connect() {
  if (channel) sb.removeChannel(channel);
  if (staffChannel) { sbStaff.removeChannel(staffChannel); staffChannel = null; }
  if (cache.staff) connectStaff();
  const on = (table, fn) => (ch) => ch.on("postgres_changes", { event: "*", schema: "public", table }, fn);
  let ch = sb.channel("tor27-" + Math.random().toString(36).slice(2));
  [
    on("bids", (p) => {
      if (p.eventType === "INSERT" && !cache.bids.some((b) => b.id === p.new.id)) { cache.bids.push(p.new); notify(); }
      else if (p.eventType !== "INSERT") reloadSoon(false);
    }),
    on("event_state", (p) => {
      const revealedNow = p.new && p.new.reveal_course && !(cache.state && cache.state.reveal_course);
      if (p.new && p.new.id === 1) cache.state = p.new;
      if (revealedNow) reloadSoon(false); else notify();
    }),
    on("lots_paid", () => reloadSoon(false)),
    on("media", () => reloadSoon(false)),
  ].forEach((add) => { ch = add(ch); });
  let first = true;
  ch.subscribe((status) => {
    // After a dropped connection comes back, catch up on anything missed.
    if (status === "SUBSCRIBED" && !first) reloadSoon(false);
    if (status === "SUBSCRIBED") first = false;
  });
  channel = ch;
}

/* Staff see private rows (every vote, guest, photo, answer) through their own
   login, so their feed must carry the staff sign-in before it subscribes. */
async function connectStaff() {
  const { data } = await sbStaff.auth.getSession();
  if (!data.session || !cache.staff) return;
  await sbStaff.realtime.setAuth(data.session.access_token);
  let sc = sbStaff.channel("tor27-staff-" + Math.random().toString(36).slice(2));
  ["votes", "guests", "media", "feedback", "vote_code_tries"].forEach((table) => {
    sc = sc.on("postgres_changes", { event: "*", schema: "public", table }, () => reloadSoon(false));
  });
  staffChannel = sc.subscribe();
}

// Backup for the host screen: while bidding or voting is open, refresh the
// counts every few seconds even if the live feed drops.
setInterval(() => {
  const s = cache.state || {};
  if (cache.staff && !document.hidden && (s.voting === "open" || s.auction === "open")) reloadSoon(false);
}, 4000);

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

/* Guests & sign-in ------------------------------------------------------------- */

export function me() {
  const g = cache.guest;
  return g ? { id: g.id, name: g.name, phone: g.phone, paddle: g.paddle } : null;
}

let pending = null;   // { name, phone } between the two sign-in steps

/** Step 1. Anonymous mode signs straight in and returns { guest }. Phone mode texts a code. */
export async function requestCode(name, phoneInput) {
  name = String(name || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) fail("Please enter your name.");
  const phone = normalizePhone(phoneInput);
  if (!phone) fail("Please enter a 10-digit US mobile number.");

  if (SIGN_IN === "anonymous") {
    const fresh = async () => {
      const res = await sb.auth.signInAnonymously();
      check(res);
      cache.user = res.data.user;
    };
    if (!cache.user) await fresh();
    try {
      return { phone, guest: await register(name, phone) };
    } catch (err) {
      // A sign-in left over from before a test-data reset points at a deleted
      // account; start a fresh one and try once more.
      await sb.auth.signOut().catch(() => {});
      await fresh();
      return { phone, guest: await register(name, phone) };
    }
  }

  check(await sb.auth.signInWithOtp({ phone: "+1" + phone }));
  pending = { name, phone };
  return { phone };
}

export async function verifyCode(phone, code) {
  const res = await sb.auth.verifyOtp({ phone: "+1" + phone, token: String(code).trim(), type: "sms" });
  if (res.error) fail("That code doesn't match. Check the text and try again.");
  cache.user = res.data.user;
  return register(pending ? pending.name : "Guest", phone);
}

async function register(name, phone) {
  const g = check(await sb.rpc("register_guest", { p_name: name, p_phone: phone }));
  cache.guest = Array.isArray(g) ? g[0] : g;
  pending = null;
  await loadAll();
  return me();
}

export async function signOut() {
  await sb.auth.signOut();
  cache.user = null;
  await loadAll();
}

/* Event state ------------------------------------------------------------------ */

export function eventState() {
  const s = cache.state || {};
  const closesAt = s.auction_closes_at || null;
  let auction = s.auction || "upcoming";
  if (auction === "open" && closesAt && Date.now() >= Date.parse(closesAt)) auction = "closed";
  return {
    auction,
    auctionClosesAt: closesAt,
    voting: s.voting || "upcoming",
    reveal: s.reveal_course ? { course: s.reveal_course, at: s.reveal_at } : null,
    feedback: Boolean(s.feedback_open),
  };
}

/* Auction ---------------------------------------------------------------------- */

export function lots() {
  const uid = cache.guest ? cache.guest.id : null;
  return LOTS.map((base) => {
    const rule = cache.rules[base.id] || {};
    const l = { ...base, start: rule.start_bid || base.start, step: rule.step || base.step };
    const bids = cache.bids.filter((b) => b.lot_id === l.id).sort((a, b) => b.amount - a.amount || a.created_at.localeCompare(b.created_at));
    const top = bids[0] || null;
    const high = top ? { amount: top.amount, paddle: top.paddle, guestId: top.guest_id } : null;
    const mineEver = uid && bids.some((b) => b.guest_id === uid);
    return {
      ...l,
      high,
      count: bids.length,
      min: high ? high.amount + l.step : l.start,
      mine: !mineEver ? null : high.guestId === uid ? "winning" : "outbid",
      paid: Boolean(cache.paid[l.id]),
    };
  });
}

export function lot(id) { return lots().find((l) => l.id === id) || null; }

export function bidHistory(lotId, limit = 6) {
  return cache.bids.filter((b) => b.lot_id === lotId).sort((a, b) => b.amount - a.amount).slice(0, limit)
    .map((b) => ({ amount: b.amount, at: b.created_at, paddle: b.paddle }));
}

export async function placeBid(lotId, amount) {
  if (!cache.guest) fail("Please sign in to bid.");
  const b = check(await sb.rpc("place_bid", { p_lot: lotId, p_amount: Math.round(Number(amount)) }));
  const row = Array.isArray(b) ? b[0] : b;
  if (row && !cache.bids.some((x) => x.id === row.id)) cache.bids.push(row);
  notify();
  return lot(lotId);
}

export function myWins() {
  if (eventState().auction !== "closed") return [];
  return lots().filter((l) => l.mine === "winning");
}

/** Sends the winner to Stripe Checkout. Netlify checks they really won before charging. */
export async function payForLot(lotId) {
  const { data } = await sb.auth.getSession();
  if (!data.session) fail("Please sign in again to pay.");
  let res;
  try {
    res = await fetch("/.netlify/functions/auction-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
      body: JSON.stringify({ lotId }),
    });
  } catch (e) {
    fail("Can't reach the payment page. Check your signal and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) fail(body.error || "Online payment isn't available right now. A staff member can take your payment.");
  return { url: body.url };
}

/** Back from Stripe with ?paid=cs_...: confirm the payment so the lot shows as paid straight away. */
async function confirmReturnFromStripe() {
  const params = new URLSearchParams(location.search);
  const session = params.get("paid");
  if (!session || !/^cs_[A-Za-z0-9_]+$/.test(session)) return;
  params.delete("paid");
  const q = params.toString();
  history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  try {
    await fetch("/.netlify/functions/auction-checkout?session=" + encodeURIComponent(session));
  } catch (e) { /* the lot still shows paid after the next reload */ }
  reloadSoon(false);
}

/* Voting ----------------------------------------------------------------------- */

export function myVote() { return cache.vote; }

/** True if code is the voting code announced in the room. Wrong codes count toward a lockout. */
export async function checkVoteCode(code) {
  if (!cache.guest) fail("Please sign in to vote.");
  return Boolean(check(await sb.rpc("check_vote_code", { p_code: String(code || "") })));
}

/** A guest's first vote needs the code; switching dishes afterwards doesn't. */
export async function castVote(courseNo, code) {
  if (!cache.guest) fail("Please sign in to vote.");
  const res = check(await sb.rpc("cast_vote", { p_course: courseNo, p_code: code ? String(code) : null }));
  if (res === "bad_code") fail("That code isn't right. Listen for the code announced in the room.");
  cache.vote = courseNo;
  notify();
}

export function voteResults() {
  if (!eventState().reveal || !cache.results) return null;
  return COURSES.map((c) => ({ ...c, votes: Number((cache.results.find((r) => r.course === c.no) || {}).votes || 0) }));
}

/* Photos & videos -------------------------------------------------------------- */

/** Uploads straight to Supabase Storage with XHR so we can show progress. */
function putObject(path, blob, contentType, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${cfg.supabaseUrl}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.setRequestHeader("apikey", cfg.supabaseKey);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.min(0.97, e.loaded / e.total)); };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ApiError(
      xhr.status === 413 ? "That file is too big to upload." : "The upload didn't go through. Please try again.")));
    xhr.onerror = () => reject(new ApiError("The upload stopped. Check your Wi-Fi or signal and try again."));
    xhr.send(blob);
  });
}

export async function uploadMedia(file, caption, onProgress) {
  if (!cache.guest) fail("Please sign in to share photos.");
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) fail("Only photos and videos can be shared.");
  const limit = kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > limit * 1024 * 1024) fail(`That ${kind === "video" ? "video" : "photo"} is over ${limit} MB. Try a shorter clip.`);
  const blob = kind === "image" ? await prepareImage(file) : file;
  const type = blob.type || file.type;
  const ext = (type.split("/")[1] || "bin").replace("quicktime", "mov").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
  const path = `${cache.guest.id}/${crypto.randomUUID()}.${ext}`;
  const { data } = await sb.auth.getSession();
  if (!data.session) fail("Please sign in again.");
  onProgress && onProgress(0.02);
  await putObject(path, blob, type, data.session.access_token, onProgress);
  check(await sb.from("media").insert({ guest_id: cache.guest.id, path, kind, caption: String(caption || "").trim().slice(0, 140) }));
  onProgress && onProgress(1);
  await loadAll();
}

export function media({ all = false } = {}) {
  const uid = cache.guest ? cache.guest.id : null;
  return (all ? cache.mediaAll : cache.media)
    .filter((m) => all || m.status === "approved" || (uid && m.guest_id === uid && m.status === "pending"))
    .map((m) => ({ id: m.id, guestId: m.guest_id, caption: m.caption, kind: m.kind, at: m.created_at, status: m.status, by: m.by_name || "Guest", mine: uid === m.guest_id, path: m.path }));
}

export async function mediaUrl(id) {
  const m = cache.media.find((x) => x.id === id) || cache.mediaAll.find((x) => x.id === id);
  return m ? `${cfg.supabaseUrl}/storage/v1/object/public/${BUCKET}/${m.path}` : "";
}

/* Feedback --------------------------------------------------------------------- */

export function myFeedback() { return cache.feedback; }

export async function submitFeedback(answers) {
  if (!cache.guest) fail("Please sign in first.");
  check(await sb.rpc("submit_feedback", { p_answers: answers }));
  cache.feedback = { answers, at: new Date().toISOString() };
  notify();
}

/* Staff ------------------------------------------------------------------------ */

export const isStaff = () => cache.staff;

export async function staffSignIn(email, password) {
  const res = await sbStaff.auth.signInWithPassword({ email: String(email).trim(), password });
  if (res.error) fail("That email and password don't match a staff account.");
  cache.staffUser = res.data.user;
  await loadAll();
  if (!cache.staff) {
    await sbStaff.auth.signOut();
    cache.staffUser = null;
    fail("This account isn't set up as staff yet. See the Staff section in supabase/schema.sql.");
  }
  connect();
}

export async function staffSignOut() {
  await sbStaff.auth.signOut();
  cache.staffUser = null;
  await loadAll();
  connect();
}

const STATE_COLUMNS = { auction: "auction", auctionClosesAt: "auction_closes_at", voting: "voting", feedback: "feedback_open" };

const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));

export const admin = {
  voteCode() { return cache.voteCode; },
  lockedOut() { return cache.lockedOut; },
  /** Give everyone locked out by wrong codes another five tries. */
  async unlockCodes() {
    check(await sbStaff.from("vote_code_tries").delete().gte("tries", 0));
    await loadAll();
  },
  /** Set a fresh voting code. Guests who already voted keep their vote. */
  async newVoteCode() {
    const code = randomCode();
    const data = check(await sbStaff.from("vote_code").update({ code, updated_at: new Date().toISOString() }).eq("id", 1).select().maybeSingle());
    if (!data) fail("Only staff can change this.");
    cache.voteCode = code;
    notify();
    return code;
  },
  /** Open voting with a fresh code. */
  async startVoting() {
    await admin.newVoteCode();
    await admin.setState({ voting: "open" });
  },
  async setState(patch) {
    const row = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "reveal") { row.reveal_course = v ? v.course : null; row.reveal_at = v ? v.at : null; }
      else if (STATE_COLUMNS[k]) row[STATE_COLUMNS[k]] = v;
    }
    const data = check(await sbStaff.from("event_state").update(row).eq("id", 1).select().maybeSingle());
    if (!data) fail("Only staff can change this.");
    cache.state = data;
    await loadAll();
  },
  tally() {
    return COURSES.map((c) => ({ ...c, votes: cache.votes.filter((v) => v.course === c.no).length }));
  },
  guests() {
    return cache.guests.map((g) => ({ id: g.id, name: g.name, phone: g.phone, paddle: g.paddle }));
  },
  bidsFor(lotId) {
    const byId = Object.fromEntries(cache.guests.map((g) => [g.id, g]));
    return cache.bids.filter((b) => b.lot_id === lotId).sort((a, b) => b.amount - a.amount).map((b) => ({ ...b, guest: byId[b.guest_id] || {} }));
  },
  results() {
    const byId = Object.fromEntries(cache.guests.map((g) => [g.id, g]));
    return lots().map((l) => ({ ...l, winner: l.high ? byId[l.high.guestId] || { name: "Guest", phone: "", paddle: l.high.paddle } : null }));
  },
  async markPaid(lotId, paid) {
    if (paid) check(await sbStaff.from("lots_paid").upsert({ lot_id: lotId, method: "manual" }));
    else check(await sbStaff.from("lots_paid").delete().eq("lot_id", lotId));
    await loadAll();
  },
  async setMedia(id, status) {
    check(await sbStaff.from("media").update({ status }).eq("id", id));
    await loadAll();
  },
  feedback() {
    const byId = Object.fromEntries(cache.guests.map((g) => [g.id, g]));
    return cache.feedbackAll.map((f) => ({ answers: f.answers, at: f.created_at, guest: byId[f.guest_id] || {} }));
  },
  simulateBid() { fail("Test bids are only available in demo mode."); },
  async reset() { fail("Live data can't be reset from here."); },
};

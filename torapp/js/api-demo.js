/* ==========================================================================
   Taste of Recovery app — data layer
   --------------------------------------------------------------------------
   Every screen talks to the backend only through the functions exported
   here, so swapping the demo backend for Supabase changes this file alone.

   This file is the DEMO backend; api-live.js is the Supabase one, and
   api.js picks between them (see config.js).

   DEMO MODE: data lives in this browser (localStorage, plus
   IndexedDB for photos and videos). Tabs in the same browser stay in sync,
   so you can open the app and /torapp/admin.html side by side. Sign-in codes
   are shown on screen instead of texted. Nothing leaves the device.
   ========================================================================== */

import { LOTS, COURSES } from "./content.js";
import { normalizePhone, formatPhone, prepareImage } from "./util.js";
export { normalizePhone, formatPhone };

export const DEMO = true;
export const SIGN_IN = "code";

const DB_KEY = "tor27-demo-db";
const SESSION_KEY = "tor27-session";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("tor27-demo") : null;
const listeners = new Set();

const MAX_BID = 100000;
export const MAX_IMAGE_MB = 15;
export const MAX_VIDEO_MB = 100;

/* Storage ---------------------------------------------------------------- */

function emptyDb() {
  return {
    guests: {},          // id -> { id, name, phone, paddle }
    pending: {},         // phone -> { name, code }
    bids: [],            // { lotId, guestId, amount, at }
    votes: {},           // guestId -> course no.
    media: [],           // { id, guestId, caption, kind, at, status }
    feedback: {},        // guestId -> { answers, at }
    paid: {},            // lotId -> ISO time
    state: {
      auction: "open",   // upcoming | open | closed
      auctionClosesAt: null,
      voting: "upcoming", // upcoming | open | closed
      reveal: null,      // { course, at }
      feedback: false,
    },
    nextPaddle: 101,
    voteCode: "",
    codeTries: {},       // guestId -> wrong codes entered
  };
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { ...emptyDb(), ...JSON.parse(raw) };
  } catch (e) { /* fall through */ }
  return emptyDb();
}

function save(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked */ }
  notify();
  if (channel) channel.postMessage("changed");
}

function mutate(fn) {
  const db = load();
  const out = fn(db);
  save(db);
  return out;
}

function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
if (channel) channel.onmessage = notify;
window.addEventListener("storage", (e) => { if (e.key === DB_KEY || e.key === SESSION_KEY) notify(); });
// Re-render once a minute so closing times take effect without a refresh.
setInterval(notify, 30000);

/** Call fn whenever anything changes (here or in another tab). Returns an unsubscribe. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

class ApiError extends Error {}
const fail = (msg) => { throw new ApiError(msg); };

/* Guests & sign-in -------------------------------------------------------- */

export function me() {
  let id = null;
  try { id = localStorage.getItem(SESSION_KEY); } catch (e) { /* blocked */ }
  return id ? load().guests[id] || null : null;
}

/** Step 1: send a code. Demo mode returns it so the screen can show it. */
export async function requestCode(name, phoneInput) {
  await wait();
  name = String(name || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) fail("Please enter your name.");
  const phone = normalizePhone(phoneInput);
  if (!phone) fail("Please enter a 10-digit US mobile number.");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  mutate((db) => { db.pending[phone] = { name, code }; });
  return { phone, demoCode: code };
}

/** Step 2: check the code and sign in. Returns the guest. */
export async function verifyCode(phone, code) {
  await wait();
  return mutate((db) => {
    const p = db.pending[phone];
    if (!p || p.code !== String(code).trim()) fail("That code doesn't match. Check the text and try again.");
    delete db.pending[phone];
    let guest = Object.values(db.guests).find((g) => g.phone === phone);
    if (guest) guest.name = p.name;
    else {
      guest = { id: uid(), name: p.name, phone, paddle: db.nextPaddle++ };
      db.guests[guest.id] = guest;
    }
    try { localStorage.setItem(SESSION_KEY, guest.id); } catch (e) { /* blocked */ }
    return guest;
  });
}

export function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* blocked */ }
  notify();
}

/* Event state ------------------------------------------------------------- */

export function eventState() {
  const s = load().state;
  const auction = s.auction === "open" && s.auctionClosesAt && Date.now() >= Date.parse(s.auctionClosesAt) ? "closed" : s.auction;
  return { ...s, auction };
}

/* Auction ----------------------------------------------------------------- */

/** All lots with live bid info, from the signed-in guest's point of view. */
export function lots() {
  const db = load();
  const guest = me();
  return LOTS.map((lot) => {
    const bids = db.bids.filter((b) => b.lotId === lot.id).sort((a, b) => b.amount - a.amount || a.at.localeCompare(b.at));
    const top = bids[0] || null;
    const high = top ? { amount: top.amount, paddle: (db.guests[top.guestId] || {}).paddle, guestId: top.guestId } : null;
    const mineEver = guest && bids.some((b) => b.guestId === guest.id);
    return {
      ...lot,
      high,
      count: bids.length,
      min: high ? high.amount + lot.step : lot.start,
      mine: !guest || !mineEver ? null : high.guestId === guest.id ? "winning" : "outbid",
      paid: Boolean(db.paid[lot.id]),
    };
  });
}

export function lot(id) { return lots().find((l) => l.id === id) || null; }

/** Recent bids on a lot, by paddle number only. */
export function bidHistory(lotId, limit = 6) {
  const db = load();
  return db.bids.filter((b) => b.lotId === lotId).sort((a, b) => b.amount - a.amount).slice(0, limit)
    .map((b) => ({ amount: b.amount, at: b.at, paddle: (db.guests[b.guestId] || {}).paddle }));
}

export async function placeBid(lotId, amount) {
  await wait(350);
  const guest = me();
  if (!guest) fail("Please sign in to bid.");
  if (eventState().auction !== "open") fail("Bidding is closed.");
  const current = lot(lotId);
  if (!current) fail("That lot doesn't exist.");
  amount = Math.round(Number(amount));
  if (!isFinite(amount) || amount < current.min) fail(`The minimum bid is now $${current.min.toLocaleString()}.`);
  if (amount > MAX_BID) fail(`Bids over $${MAX_BID.toLocaleString()} need to go through a staff member.`);
  if (current.high && current.high.guestId === guest.id) fail("You're already the high bidder on this lot.");
  mutate((db) => { db.bids.push({ lotId, guestId: guest.id, amount, at: new Date().toISOString() }); });
  return lot(lotId);
}

/** Lots this guest won once bidding closed. */
export function myWins() {
  if (eventState().auction !== "closed") return [];
  return lots().filter((l) => l.mine === "winning");
}

/** Start payment for a won lot. Returns { url } for Stripe Checkout, or { demo: true }. */
export async function payForLot(lotId) {
  await wait(500);
  const won = myWins().find((l) => l.id === lotId);
  if (!won) fail("This lot isn't yours to pay for.");
  // Live mode: POST to /.netlify/functions/auction-checkout and redirect to Stripe.
  mutate((db) => { db.paid[lotId] = new Date().toISOString(); });
  return { demo: true };
}

/* Voting ------------------------------------------------------------------ */

export function myVote() {
  const guest = me();
  return guest ? load().votes[guest.id] || null : null;
}

/** Same rules as the server: five wrong codes and the guest is locked out. */
function codeOk(db, guestId, code) {
  if ((db.codeTries[guestId] || 0) >= 5) fail("Too many wrong codes. Please find a staff member.");
  if (db.voteCode && String(code || "").trim() === db.voteCode) return true;
  db.codeTries[guestId] = (db.codeTries[guestId] || 0) + 1;
  return false;
}

export async function checkVoteCode(code) {
  await wait();
  const guest = me();
  if (!guest) fail("Please sign in to vote.");
  if (eventState().voting !== "open") fail("Voting isn't open right now.");
  return mutate((db) => codeOk(db, guest.id, code));
}

export async function castVote(courseNo, code) {
  await wait();
  const guest = me();
  if (!guest) fail("Please sign in to vote.");
  if (eventState().voting !== "open") fail("Voting isn't open right now.");
  if (!COURSES.some((c) => c.no === courseNo)) fail("Pick a course.");
  const ok = mutate((db) => {
    if (!db.votes[guest.id] && !codeOk(db, guest.id, code)) return false;
    db.votes[guest.id] = courseNo;
    return true;
  });
  if (!ok) fail("That code isn't right. Listen for the code announced in the room.");
}

/** Vote counts per course, only once the winner has been revealed. */
export function voteResults() {
  if (!eventState().reveal) return null;
  const votes = Object.values(load().votes);
  return COURSES.map((c) => ({ ...c, votes: votes.filter((v) => v === c.no).length }));
}

/* Photos & videos --------------------------------------------------------- */

const IDB = { name: "tor27-demo-media", store: "blobs" };
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB.name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB.store, mode);
    const req = fn(tx.objectStore(IDB.store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function uploadMedia(file, caption, onProgress) {
  const guest = me();
  if (!guest) fail("Please sign in to share photos.");
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) fail("Only photos and videos can be shared.");
  const limit = kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > limit * 1024 * 1024) fail(`That ${kind === "video" ? "video" : "photo"} is over ${limit} MB. Try a shorter clip.`);
  const blob = kind === "image" ? await prepareImage(file) : file;
  for (let p = 0.2; p < 1; p += 0.2) { onProgress && onProgress(p); await wait(120); }
  const id = uid();
  await idbDo("readwrite", (s) => s.put(blob, id));
  mutate((db) => {
    db.media.push({ id, guestId: guest.id, caption: String(caption || "").trim().slice(0, 140), kind, at: new Date().toISOString(), status: "pending" });
  });
  onProgress && onProgress(1);
}

/** Approved items for everyone, plus the guest's own pending ones. Newest first. */
export function media({ all = false } = {}) {
  const db = load();
  const guest = me();
  return db.media
    .filter((m) => all || m.status === "approved" || (guest && m.guestId === guest.id && m.status === "pending"))
    .map((m) => ({ ...m, by: (db.guests[m.guestId] || {}).name || "Guest", mine: Boolean(guest && m.guestId === guest.id) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

const urlCache = new Map();
export async function mediaUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await idbDo("readonly", (s) => s.get(id));
  const url = blob ? URL.createObjectURL(blob) : "";
  urlCache.set(id, url);
  return url;
}

/* Feedback ---------------------------------------------------------------- */

export function myFeedback() {
  const guest = me();
  return guest ? load().feedback[guest.id] || null : null;
}

export async function submitFeedback(answers) {
  await wait();
  const guest = me();
  if (!guest) fail("Please sign in first.");
  if (!eventState().feedback) fail("Feedback opens after the gala.");
  mutate((db) => { db.feedback[guest.id] = { answers, at: new Date().toISOString() }; });
}

/* Admin ------------------------------------------------------------------- */
/* Live mode: these run as Netlify functions that check a staff login.
   Demo mode: the admin page asks for the demo PIN below. */

export const DEMO_ADMIN_PIN = "2027";

// Demo staff sign in with the PIN (typed in the password box) instead of an account.
const STAFF_KEY = "tor27-demo-staff";
export function isStaff() {
  try { return localStorage.getItem(STAFF_KEY) === "1"; } catch (e) { return false; }
}
export async function staffSignIn(email, password) {
  await wait();
  if (String(password || "").trim() !== DEMO_ADMIN_PIN) fail(`In demo mode the staff password is ${DEMO_ADMIN_PIN}.`);
  try { localStorage.setItem(STAFF_KEY, "1"); } catch (e) { /* blocked */ }
  notify();
}
export async function staffSignOut() {
  try { localStorage.removeItem(STAFF_KEY); } catch (e) { /* blocked */ }
  notify();
}

export const admin = {
  setState(patch) { mutate((db) => { Object.assign(db.state, patch); }); },
  voteCode() { return load().voteCode || ""; },
  lockedOut() { return Object.values(load().codeTries || {}).filter((n) => n >= 5).length; },
  unlockCodes() { mutate((db) => { db.codeTries = {}; }); },
  newVoteCode() {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    mutate((db) => { db.voteCode = code; });
    return code;
  },
  startVoting() {
    mutate((db) => { db.voteCode = String(Math.floor(1000 + Math.random() * 9000)); db.state.voting = "open"; });
  },
  tally() {
    const votes = Object.values(load().votes);
    return COURSES.map((c) => ({ ...c, votes: votes.filter((v) => v === c.no).length }));
  },
  guests() {
    const db = load();
    return Object.values(db.guests).sort((a, b) => a.paddle - b.paddle);
  },
  bidsFor(lotId) {
    const db = load();
    return db.bids.filter((b) => b.lotId === lotId).sort((a, b) => b.amount - a.amount)
      .map((b) => ({ ...b, guest: db.guests[b.guestId] || {} }));
  },
  results() {
    const db = load();
    return lots().map((l) => ({ ...l, winner: l.high ? db.guests[l.high.guestId] || null : null }));
  },
  markPaid(lotId, paid) { mutate((db) => { if (paid) db.paid[lotId] = new Date().toISOString(); else delete db.paid[lotId]; }); },
  setMedia(id, status) { mutate((db) => { const m = db.media.find((x) => x.id === id); if (m) m.status = status; }); },
  feedback() {
    const db = load();
    return Object.entries(db.feedback).map(([gid, f]) => ({ ...f, guest: db.guests[gid] || {} }));
  },
  /** Demo only: a pretend guest outbids the current leader, to test outbid alerts. */
  simulateBid(lotId) {
    mutate((db) => {
      let bot = Object.values(db.guests).find((g) => g.phone === "0000000000");
      if (!bot) { bot = { id: uid(), name: "Demo Bidder", phone: "0000000000", paddle: db.nextPaddle++ }; db.guests[bot.id] = bot; }
      const l = LOTS.find((x) => x.id === lotId);
      const top = db.bids.filter((b) => b.lotId === lotId).reduce((m, b) => Math.max(m, b.amount), 0);
      db.bids.push({ lotId, guestId: bot.id, amount: top ? top + l.step : l.start, at: new Date().toISOString() });
    });
  },
  /** Demo only: wipe everything in this browser. */
  async reset() {
    try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* blocked */ }
    try { await idbDo("readwrite", (s) => s.clear()); } catch (e) { /* no IDB */ }
    save(emptyDb());
  },
};

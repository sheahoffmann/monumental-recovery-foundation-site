/* ==========================================================================
   Taste of Recovery 2027 — host controls
   --------------------------------------------------------------------------
   The staff screen: one big button per step of the night (bidding, voting,
   the reveal, the feedback form), then lots and payments, photo approvals
   and feedback. Shown in the app's Host tab once a staff member signs in,
   and on gala/admin.html. Every action is checked by the server in live mode.
   ========================================================================== */

import * as api from "./api.js";
import { EVENT, CHEFS, COURSES, FEEDBACK } from "./content.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pad3 = (n) => String(n).padStart(3, "0");
const chefFor = (no) => CHEFS.find((c) => c.course === no) || null;
const GALA_DATE = EVENT.galaStart.slice(0, 10);

let manualPick = null;   // set when staff choose a course by hand (e.g. to break a tie)
let revealPick = null;

/** The host screen as HTML, from the current data. */
export function hostHtml() {
  const s = api.eventState();
  const tally = api.admin.tally();
  const totalVotes = tally.reduce((t, r) => t + r.votes, 0);
  const top = [...tally].sort((a, b) => b.votes - a.votes)[0];
  const tie = tally.filter((r) => r.votes === top.votes && top.votes > 0).length > 1;
  revealPick = manualPick ?? (top.votes ? top.no : null);
  const results = api.admin.results();
  const raised = results.filter((l) => l.high).reduce((t, l) => t + l.high.amount, 0);
  const paid = results.filter((l) => l.high && l.paid).reduce((t, l) => t + l.high.amount, 0);
  const pending = api.media({ all: true }).filter((m) => m.status === "pending");
  const approved = api.media({ all: true }).filter((m) => m.status === "approved");
  const fb = api.admin.feedback();
  const guests = api.admin.guests().filter((g) => g.phone !== "0000000000");
  const closeTime = s.auctionClosesAt ? new Date(s.auctionClosesAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: EVENT.timezone }) : "";

  return `
    <div class="page-h"><p class="mono gold">Host controls</p><h1>Gala night</h1><p>${guests.length} guest${guests.length === 1 ? "" : "s"} signed in · ${money(raised)} bid · ${money(paid)} paid</p></div>

    <div class="host">
      <section class="card host-step ${s.auction === "open" ? "live" : ""}">
        <div class="host-h"><p class="mono gold">1 · Silent auction</p><span class="tag ${s.auction === "open" ? "now" : ""}">${s.auction === "open" ? "Bidding open" : s.auction === "closed" ? "Closed" : "Not open yet"}</span></div>
        ${s.auction === "open"
          ? `<button class="big-btn end" data-set="auction" data-v="closed" data-confirm="Close bidding now? No more bids will be accepted and winners will see a Pay button.">End bidding</button>`
          : s.auction === "closed"
            ? `<p class="host-done">Bidding has ended · ${money(raised)} in winning bids</p><button class="link-btn" data-set="auction" data-v="open">Reopen bidding</button>`
            : `<button class="big-btn" data-set="auction" data-v="open">Start bidding</button>`}
        <form class="row" id="close-form" style="margin-top:12px">
          <label class="fine" for="close-at">Or end automatically at</label>
          <input class="field" type="time" id="close-at" name="t" value="${closeTime}">
          <button class="btn btn-ghost btn-sm">Set</button>
          ${s.auctionClosesAt ? `<button type="button" class="btn btn-ghost btn-sm" data-clear-close>Clear</button>` : ""}
        </form>
      </section>

      <section class="card host-step ${s.voting === "open" ? "live" : ""}">
        <div class="host-h"><p class="mono gold">2 · Voting</p><span class="tag ${s.voting === "open" ? "now" : ""}">${s.voting === "open" ? "Voting open" : s.voting === "closed" ? "Closed" : "Not open yet"}</span></div>
        ${s.voting === "open"
          ? `<div class="vote-code"><span class="mono">Voting code: announce it to the room</span><b>${esc(api.admin.voteCode() || "----")}</b>
               <button class="link-btn" data-new-code data-confirm="Make a new code? Guests who haven't voted yet will need the new one. Votes already cast stay.">New code</button></div>
             <p class="host-count"><b>${totalVotes}</b> ${totalVotes === 1 ? "guest has" : "guests have"} voted</p>
             ${api.admin.lockedOut() ? `<p class="demo-note" style="margin:0 0 12px">${api.admin.lockedOut()} guest${api.admin.lockedOut() === 1 ? " is" : "s are"} locked out after 5 wrong codes. <button class="link-btn" data-unlock>Unlock</button></p>` : ""}
             <button class="big-btn end" data-set="voting" data-v="closed" data-confirm="End voting now? Every guest's current pick becomes their final vote.">End voting</button>`
          : s.voting === "closed"
            ? `<p class="host-done">Voting has ended · ${totalVotes} vote${totalVotes === 1 ? "" : "s"}</p>${s.reveal ? "" : `<button class="link-btn" data-set="voting" data-v="open">Reopen voting</button>`}`
            : `<button class="big-btn" data-start-voting>Start voting</button>
               <p class="fine" style="margin:10px 0 0">Starting voting creates a 4-digit code for you to announce. Guests enter it once, then tap a dish; they can switch dishes until you end voting.</p>`}
      </section>

      <section class="card host-step hl">
        <div class="host-h"><p class="mono gold">3 · The reveal</p>${s.reveal ? `<span class="tag now">Revealed</span>` : ""}</div>
        ${s.reveal ? `
          <p class="mono" style="margin:6px 0 0">Course ${s.reveal.course} · ${esc(COURSES[s.reveal.course - 1].name)}</p>
          <h2 style="margin:4px 0 2px">${esc((chefFor(s.reveal.course) || {}).name || "Course " + s.reveal.course)}</h2>
          <p style="margin:0 0 8px">${esc((chefFor(s.reveal.course) || {}).program || "")}</p>
          <p class="dim">Every phone now shows the engraved trophy and the full results.</p>
          <button class="link-btn" data-unreveal>Undo the reveal</button>` : s.voting !== "closed" ? `
          <p class="dim" style="margin:6px 0 0">Available once voting ends. You'll see the count here before anything is shown to guests.</p>` : `
          ${tie ? `<p class="demo-note">It's a tie at ${top.votes} votes. Pick the winner below.</p>` : ""}
          <div class="table-wrap"><table>
            <thead><tr><th></th><th>Dish</th><th>Chef · facility</th><th class="num">Votes</th></tr></thead>
            <tbody>${[...tally].sort((a, b) => b.votes - a.votes || a.no - b.no).map((r) => `
              <tr><td><input type="radio" name="pick" value="${r.no}" ${revealPick === r.no ? "checked" : ""} aria-label="Choose course ${r.no}"></td>
              <td>${r.no}. ${esc(r.name)}</td><td>${esc((chefFor(r.no) || {}).name || "")}<br><span class="fine">${esc((chefFor(r.no) || {}).program || "")}</span></td><td class="num">${r.votes}</td></tr>`).join("")}
            </tbody></table></div>
          <button class="big-btn gold" style="margin-top:12px" data-reveal ${revealPick ? "" : "disabled"}>Reveal the winner</button>
          ${!revealPick ? `<p class="fine" style="margin:8px 0 0">No votes yet. Pick a course to reveal it anyway.</p>` : ""}`}
      </section>

      <section class="card host-step">
        <div class="host-h"><p class="mono gold">4 · Feedback form</p><span class="tag ${s.feedback ? "now" : ""}">${s.feedback ? "Open" : "Not open yet"}</span></div>
        ${s.feedback
          ? `<button class="big-btn end" data-set="feedback" data-v="false">Close feedback form</button>`
          : `<button class="big-btn" data-set="feedback" data-v="true">Open feedback form</button>`}
      </section>
    </div>

    <section class="card" style="margin-top:12px">
      <p class="mono gold">Lots</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Lot</th><th class="num">High bid</th><th>Bidder</th><th>Paid</th>${api.DEMO ? "<th></th>" : ""}</tr></thead>
        <tbody>${results.map((l) => `
          <tr><td>${l.no}. ${esc(l.title)}<br><span class="fine">${l.count} bid${l.count === 1 ? "" : "s"}</span></td>
          <td class="num">${l.high ? money(l.high.amount) : "—"}</td>
          <td>${l.winner ? `Paddle ${pad3(l.winner.paddle)}<br><span class="fine">${esc(l.winner.name)} · ${esc(api.formatPhone(l.winner.phone))}</span>` : "—"}</td>
          <td>${l.high ? `<label class="row"><input type="checkbox" data-paid="${l.id}" ${l.paid ? "checked" : ""}> <span class="fine">${l.paid ? "Paid" : "Unpaid"}</span></label>` : ""}</td>
          ${api.DEMO ? `<td><button class="btn btn-ghost btn-sm" data-sim="${l.id}" ${s.auction === "open" ? "" : "disabled"}>Outbid (test)</button></td>` : ""}</tr>`).join("")}
        </tbody></table></div>
    </section>

    <section class="card" style="margin-top:12px">
      <p class="mono gold">Photos waiting for approval · ${pending.length}</p>
      ${pending.length ? `<div class="mod">${pending.map((m) => `
        <figure>${m.kind === "video" ? `<video data-media="${m.id}" controls playsinline muted preload="metadata"></video>` : `<img data-media="${m.id}" alt="">`}
          <figcaption><b>${esc(m.by)}</b>${m.caption ? ` · ${esc(m.caption)}` : ""}</figcaption>
          <div class="acts"><button class="btn btn-gold btn-sm" data-media-set="approved" data-id="${m.id}">Approve</button><button class="btn btn-ghost btn-sm" data-media-set="hidden" data-id="${m.id}">Hide</button></div>
        </figure>`).join("")}</div>` : `<p class="dim" style="margin:0">Nothing waiting. ${approved.length} approved so far.</p>`}
      ${approved.length ? `<details style="margin-top:12px"><summary class="fine">Approved (${approved.length})</summary><div class="mod" style="margin-top:10px">${approved.map((m) => `
        <figure>${m.kind === "video" ? `<video data-media="${m.id}" controls playsinline muted preload="metadata"></video>` : `<img data-media="${m.id}" alt="">`}
          <figcaption>${esc(m.by)}</figcaption>
          <div class="acts" style="grid-template-columns:1fr"><button class="btn btn-ghost btn-sm" data-media-set="hidden" data-id="${m.id}">Hide</button></div>
        </figure>`).join("")}</div></details>` : ""}
    </section>

    <section class="card" style="margin-top:12px">
      <div class="row" style="justify-content:space-between"><p class="mono gold" style="margin:0">Feedback · ${fb.length}</p>${fb.length ? `<button class="btn btn-ghost btn-sm" data-csv>Download CSV</button>` : ""}</div>
      ${fb.length ? feedbackSummary(fb) : `<p class="dim" style="margin:8px 0 0">No responses yet.</p>`}
    </section>

    ${api.DEMO ? `<section class="card warn" style="margin-top:12px"><p class="mono">Demo</p><p class="dim">Wipes every guest, bid, vote, photo and response in this browser.</p><button class="btn btn-ghost btn-sm" data-reset>Reset demo data</button></section>` : ""}
    <p style="margin-top:18px;text-align:center"><button class="link-btn" data-staff-out>Staff sign out</button></p>`;

}

function feedbackSummary(fb) {
  return FEEDBACK.map((q) => {
    const vals = fb.map((f) => f.answers[q.id]).filter((v) => v !== undefined && v !== "");
    if (q.type === "stars") {
      const avg = vals.length ? vals.reduce((t, v) => t + Number(v), 0) / vals.length : 0;
      return `<p style="margin:12px 0 0"><b>${esc(q.label)}</b><br><span class="dim">${avg.toFixed(1)} / 5 average from ${vals.length}</span></p>`;
    }
    if (q.type === "choice") {
      return `<p style="margin:12px 0 0"><b>${esc(q.label)}</b><br><span class="dim">${q.options.map((o) => `${esc(o)}: ${vals.filter((v) => v === o).length}`).join(" · ")}</span></p>`;
    }
    return `<div style="margin-top:12px"><b>${esc(q.label)}</b>${vals.length ? `<ul style="margin:6px 0 0;padding-left:1.2em">${vals.map((v) => `<li class="dim">${esc(v)}</li>`).join("")}</ul>` : `<p class="dim" style="margin:0">No answers.</p>`}</div>`;
  }).join("");
}

function downloadCsv() {
  const rows = [["Name", "Paddle", "Phone", "Submitted", ...FEEDBACK.map((q) => q.label)]];
  api.admin.feedback().forEach((f) => rows.push([f.guest.name, f.guest.paddle, api.formatPhone(f.guest.phone), f.at, ...FEEDBACK.map((q) => f.answers[q.id] ?? "")]));
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "taste-of-recovery-2027-feedback.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Wire up the host screen's buttons inside root (call once). toast(msg, tone) shows messages. */
export function bindHost(root, toast, onSignOut) {
  /** Run a staff action; live mode talks to the server, so show any error. */
  async function run(fn, done) {
    try { await fn(); if (done) toast(done); } catch (err) { toast(err.message || "That didn't work. Try again.", "warn"); }
  }

  root.addEventListener("submit", async (e) => {
    const f = e.target;
    if (f.id !== "close-form") return;
    e.preventDefault();
    if (f.id === "close-form") {
      const t = f.t.value;
      if (!t) return;
      document.activeElement.blur();
      run(() => api.admin.setState({ auctionClosesAt: new Date(`${GALA_DATE}T${t}:00-06:00`).toISOString() }), "Auto-close time set.");
    }
  });

  root.addEventListener("change", (e) => {
    if (e.target.name === "pick") { manualPick = revealPick = Number(e.target.value); return; }
    if (e.target.dataset.paid) run(() => api.admin.markPaid(e.target.dataset.paid, e.target.checked));
  });

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.set) {
      if (t.dataset.confirm && !confirm(t.dataset.confirm)) return;
      const key = t.dataset.set;
      const v = key === "feedback" ? t.dataset.v === "true" : t.dataset.v;
      const patch = { [key]: v };
      // Reopening a closed auction would otherwise snap shut again on the old time.
      if (key === "auction" && v === "open") {
        const s = api.eventState();
        if (s.auctionClosesAt && Date.now() >= Date.parse(s.auctionClosesAt)) patch.auctionClosesAt = null;
      }
      run(() => api.admin.setState(patch));
    }
    if (t.hasAttribute("data-start-voting")) run(() => api.admin.startVoting(), "Voting is open. Announce the code.");
    if (t.hasAttribute("data-unlock")) run(() => api.admin.unlockCodes(), "Unlocked. They can try the code again.");
    if (t.hasAttribute("data-new-code")) {
      if (!confirm(t.dataset.confirm)) return;
      run(() => api.admin.newVoteCode(), "New code ready. Announce it to the room.");
    }
    if (t.hasAttribute("data-clear-close")) run(() => api.admin.setState({ auctionClosesAt: null }));
    if (t.hasAttribute("data-staff-out")) { await api.staffSignOut(); if (onSignOut) onSignOut(); }
    if (t.hasAttribute("data-reveal")) {
      const chef = chefFor(revealPick);
      const who = chef ? `${chef.name}${chef.program ? " (" + chef.program + ")" : ""}` : "course " + revealPick;
    if (!confirm(`Reveal ${who}, course ${revealPick}: ${COURSES[revealPick - 1].name}, as the 2027 champion? Every guest's phone updates immediately.`)) return;
      const course = revealPick;
      manualPick = null;
      run(() => api.admin.setState({ reveal: { course, at: new Date().toISOString() } }), "Revealed. The trophy is engraving on every phone.");
    }
    if (t.hasAttribute("data-unreveal")) {
      if (confirm("Undo the reveal? Guests will see 'awaiting champion' again.")) run(() => api.admin.setState({ reveal: null }));
    }
    if (t.dataset.sim) run(() => api.admin.simulateBid(t.dataset.sim));
    if (t.dataset.mediaSet) run(() => api.admin.setMedia(t.dataset.id, t.dataset.mediaSet));
    if (t.hasAttribute("data-csv")) downloadCsv();
    if (t.hasAttribute("data-reset") && confirm("Wipe all demo data in this browser?")) { await api.admin.reset(); manualPick = null; toast("Demo data cleared."); }
  });
}

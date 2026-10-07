/* Taste of Recovery — event page behaviour
   1. A chrome-and-lacquer trophy, built in three.js, that turns as you scroll.
   2. Small page interactions: countdown, day tabs, number count-up, course meter,
      and the engraving that "types" when you reach the trophy section.
   Loaded as a module from taste-of-recovery.html. main.js still handles the nav. */

import * as THREE from "../vendor/three.module.min.js";
import { RoomEnvironment } from "../vendor/RoomEnvironment.js";
import { buildTrophy, loadTrophyFonts } from "./trophy-model.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;

/* ==========================================================================
   Page interactions
   ========================================================================== */

/* Countdown to gala night (June 17, 2027, Mountain time) ------------------ */
(function countdown() {
  const root = document.getElementById("countdown");
  if (!root) return;
  const target = new Date("2027-06-17T00:00:00-06:00").getTime();
  const out = {};
  root.querySelectorAll("[data-cd]").forEach((el) => { out[el.dataset.cd] = el; });
  const pad = (n, w) => String(n).padStart(w, "0");
  const tick = () => {
    const ms = Math.max(0, target - Date.now());
    const s = Math.floor(ms / 1000);
    out.d.textContent = pad(Math.floor(s / 86400), 3);
    out.h.textContent = pad(Math.floor((s % 86400) / 3600), 2);
    out.m.textContent = pad(Math.floor((s % 3600) / 60), 2);
    out.s.textContent = pad(s % 60, 2);
  };
  tick();
  setInterval(tick, 1000);
})();

/* Day tabs (arrow keys move between them) --------------------------------- */
(function dayTabs() {
  const tabs = Array.from(document.querySelectorAll('.day-tabs [role="tab"]'));
  if (!tabs.length) return;
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
})();

/* Count the big numbers up once they come into view ----------------------- */
(function countUp() {
  const els = document.querySelectorAll("[data-count]");
  if (!els.length || reduced || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      io.unobserve(el);
      const end = Number(el.dataset.count);
      const start = performance.now();
      const run = (now) => {
        const p = Math.min(1, (now - start) / 1400);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(run);
      };
      el.textContent = "0";
      requestAnimationFrame(run);
    });
  }, { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
})();

/* Golf hole sponsorships --------------------------------------------------
   Sold holes come from netlify/functions/golf-holes.js (Stripe is the record).
   Clicking an open hole asks for the facility name, then goes to Stripe Checkout. */
(function golfHoles() {
  const grid = document.getElementById("holes-grid");
  const dialog = document.getElementById("hole-dialog");
  if (!grid || !dialog) return;
  const form = document.getElementById("hole-form");
  const numEl = document.getElementById("hole-dialog-num");
  const facility = document.getElementById("hole-facility");
  const errorEl = document.getElementById("hole-error");
  const submit = document.getElementById("hole-submit");
  const caption = document.getElementById("holes-caption");
  const thanks = document.getElementById("holes-thanks");
  const buttons = Array.from(grid.querySelectorAll("[data-hole]"));
  let current = 0;

  const markSold = (sold) => {
    buttons.forEach((b) => {
      const n = Number(b.dataset.hole);
      if (!sold.includes(n)) return;
      b.classList.add("is-sold");
      b.disabled = true;
      b.setAttribute("aria-label", "Hole " + n + ", sponsored");
    });
    const open = buttons.filter((b) => !b.disabled).length;
    caption.textContent = open
      ? open + " of 18 holes still open. Pick one to sponsor it for your facility."
      : "Every hole is sponsored. Thank you!";
  };

  const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };
  const open = (n) => {
    current = n;
    numEl.textContent = String(n).padStart(2, "0");
    errorEl.hidden = true;
    submit.disabled = false;
    submit.textContent = "Continue to payment";
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    facility.focus();
  };
  const close = () => { if (dialog.close) dialog.close(); else dialog.removeAttribute("open"); };

  buttons.forEach((b) => b.addEventListener("click", () => { if (!b.disabled) open(Number(b.dataset.hole)); }));
  dialog.querySelectorAll("[data-close-hole]").forEach((b) => b.addEventListener("click", close));
  dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
  facility.addEventListener("input", () => { errorEl.hidden = true; });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = facility.value.trim();
    if (name.length < 2) { showError("Please enter the name of the sponsoring facility."); facility.focus(); return; }
    submit.disabled = true;
    submit.textContent = "Taking you to checkout…";
    fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "hole", hole: current, facility: name }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data.url) { window.location.href = data.url; return; }
        if (data && data.sold) { markSold(data.sold); }
        throw new Error((data && data.error) || "We could not start checkout. Please try again.");
      })
      .catch((err) => {
        let msg = err && err.message ? err.message : "";
        if (!msg || /failed to fetch|networkerror|load failed|json/i.test(msg)) {
          msg = "We could not reach the payment system. Please try again, or email give@monumentalrecovery.org.";
        }
        showError(msg);
        submit.disabled = false;
        submit.textContent = "Continue to payment";
      });
  });

  // Load sold holes. After a successful payment Stripe returns here with ?hole_session=.
  const params = new URLSearchParams(window.location.search);
  const session = params.get("hole_session") || "";
  fetch("/.netlify/functions/golf-holes" + (session ? "?session=" + encodeURIComponent(session) : ""))
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.sold)) return;
      markSold(data.sold);
      if (data.justPaid) {
        thanks.textContent = "Thank you! Hole " + data.justPaid + " is yours. Stripe has emailed your receipt.";
        thanks.hidden = false;
        const btn = buttons.find((b) => Number(b.dataset.hole) === data.justPaid);
        if (btn) btn.classList.add("is-new");
      }
      if (session && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + "#golf");
      }
    })
    .catch(() => { /* leave every hole open; checkout re-checks before charging */ });
})();

/* Course meter: which numbered section you're in, plus page progress ------ */
const meterNum = document.getElementById("meter-num");
const meterFill = document.getElementById("meter-fill");
const numbered = Array.from(document.querySelectorAll("main section")).map((sec) => {
  const tag = sec.querySelector(".mono-tag");
  const m = tag && tag.textContent.trim().match(/^(\d{2})/);
  return { sec, num: m ? m[1] : null };
});

/* Engraving that types out when the trophy section is reached ------------- */
const engraveLine = document.getElementById("engrave-line");
const engraveText = engraveLine ? engraveLine.textContent : "";
let engraved = false;
function typeEngraving() {
  if (engraved || !engraveLine) return;
  engraved = true;
  if (reduced) return;
  engraveLine.textContent = "";
  engraveLine.classList.add("is-typing");
  let i = 0;
  const step = () => {
    engraveLine.textContent = engraveText.slice(0, ++i);
    if (i < engraveText.length) setTimeout(step, 55);
    else setTimeout(() => engraveLine.classList.remove("is-typing"), 1200);
  };
  setTimeout(step, 400);
}

/* ==========================================================================
   The trophy
   ========================================================================== */

const stageEl = document.querySelector(".stage");
const canvas = document.getElementById("trophy-canvas");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (err) {
  renderer = null;
}

/* Stage presets. Each section declares data-stage; the camera eases between these.
   shiftX/shiftY move the trophy within the frame (fractions of the viewport),
   zoom < 1 pushes in, focusY is the height on the trophy the camera looks at. */
const STAGES = {
  desktop: {
    hero:  { shiftX: 0.23, shiftY: -0.03, zoom: 1.0,  focusY: 1.95, opacity: 1,    face: 0 },
    right: { shiftX: 0.25, shiftY: -0.03, zoom: 1.05, focusY: 1.95, opacity: 0.95, face: 0 },
    dim:   { shiftX: 0.22, shiftY: 0.0,  zoom: 1.1,  focusY: 1.95, opacity: 0.12, face: 0 },
    close: { shiftX: 0.2,  shiftY: -0.02, zoom: 0.62, focusY: 1.35, opacity: 1,    face: 1 },
  },
  mobile: {
    hero:  { shiftX: 0, shiftY: 0.25, zoom: 1.0,  focusY: 1.95, opacity: 1,    face: 0 },
    right: { shiftX: 0, shiftY: 0.0,  zoom: 1.0,  focusY: 1.95, opacity: 0.16, face: 0 },
    dim:   { shiftX: 0, shiftY: 0.0,  zoom: 1.0,  focusY: 1.95, opacity: 0.1,  face: 0 },
    close: { shiftX: 0, shiftY: 0.26, zoom: 0.62, focusY: 1.3,  opacity: 1,    face: 1 },
  },
};

if (!renderer) {
  stageEl.classList.add("no-webgl");
} else {
  buildTrophyScene().catch(() => stageEl.classList.add("no-webgl"));
}

async function buildTrophyScene() {
  await loadTrophyFonts();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.95;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // Lights add the crisp highlights; the room environment does the reflections.
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 2.4);
  rim.position.set(5, 4, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xd9c296, 0.8);
  fill.position.set(4, 1, 5);
  scene.add(fill);

  const model = buildTrophy(scene.environment);
  const trophy = model.group;
  scene.add(trophy);
  const TROPHY_H = model.height;
  const TROPHY_W = model.width;

  /* Scroll choreography ---------------------------------------------------- */
  const sections = Array.from(document.querySelectorAll("[data-stage]"));
  const isMobile = () => window.innerWidth < 900;
  const cur = { ...STAGES.desktop.hero };
  let target = cur;
  let angle = -0.5;
  let lastScroll = window.scrollY;
  let tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
  let engraveStart = 0;
  let plateN = -1, plateDone = false;

  function activeStage() {
    const mid = window.innerHeight * 0.5;
    for (const sec of sections) {
      const r = sec.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) return sec;
    }
    return window.scrollY < 50 ? sections[0] : sections[sections.length - 1];
  }

  function updateMeter() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (meterFill) meterFill.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    if (!meterNum) return;
    const mid = window.innerHeight * 0.5;
    let num = "01";
    for (const n of numbered) {
      if (n.num && n.sec.getBoundingClientRect().top < mid) num = n.num;
    }
    if (meterNum.textContent !== num) meterNum.textContent = num;
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  if (!reduced) {
    window.addEventListener("pointermove", (e) => {
      aimX = (e.clientX / window.innerWidth - 0.5);
      aimY = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });
  }

  const lerp = (a, b, t) => a + (b - a) * t;

  function frame(now) {
    const w = window.innerWidth, h = window.innerHeight;
    const sec = activeStage();
    const kind = sec ? sec.dataset.stage : "hero";
    target = (isMobile() ? STAGES.mobile : STAGES.desktop)[kind] || STAGES.desktop.hero;
    if (kind === "close" && !engraveStart) { engraveStart = now; typeEngraving(); }

    const k = reduced ? 1 : 0.06;
    for (const p in target) cur[p] = lerp(cur[p], target[p], k);

    // Rotation: scrolling turns it; in the trophy section it settles face-on.
    const y = window.scrollY;
    const dy = y - lastScroll;
    lastScroll = y;
    angle += dy * (TAU / 1700) * (1 - cur.face);
    if (!reduced) angle += 0.0018 * (1 - cur.face);
    if (cur.face > 0.01) {
      const front = Math.round(angle / TAU) * TAU;
      angle += (front - angle) * 0.07 * cur.face;
    }
    tiltX = lerp(tiltX, aimY * 0.08, 0.05);
    tiltY = lerp(tiltY, aimX * 0.25, 0.05);
    trophy.rotation.set(tiltX, angle + tiltY, 0);

    // Fit the trophy to the frame, then frame it according to the stage.
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const span = 2 * Math.tan(vFov / 2);
    const fracH = isMobile() ? 0.34 : 0.62;
    const fracW = isMobile() ? 0.7 : 0.42;
    const fitDist = Math.max(TROPHY_H / (span * fracH), TROPHY_W / (span * camera.aspect * fracW));
    const dist = fitDist * cur.zoom;
    camera.position.set(0, cur.focusY + dist * 0.12, dist);
    camera.lookAt(0, cur.focusY, 0);
    camera.setViewOffset(w, h, -cur.shiftX * w, cur.shiftY * h, w, h);

    // Engrave the 2027 plate letter by letter after the camera arrives.
    if (engraveStart) {
      const t = (now - engraveStart - 700) / 1600;
      const yr = "2027", label = "INAUGURAL CHAMPION";
      if (reduced || t >= 1.2) {
        if (!plateDone) { model.setPlate(yr, label); plateDone = true; }
      } else if (t > 0) {
        const total = yr.length + label.length;
        const n = Math.floor(Math.min(1, t) * total);
        if (plateN !== n) {
          plateN = n;
          model.setPlate(yr.slice(0, n), label.slice(0, Math.max(0, n - yr.length)));
        }
      }
    }

    stageEl.style.opacity = cur.opacity.toFixed(3);
    updateMeter();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

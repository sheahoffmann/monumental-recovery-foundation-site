/* ==========================================================================
   Taste of Recovery app — trophy viewer
   --------------------------------------------------------------------------
   One WebGL canvas for the whole app. mountTrophy(el) moves it into the
   current screen; it spins on its own and can be flicked with a finger.
   engrave(label, sub) turns it face-on, pushes in on the plate and types the
   winner's name, then backs out and keeps spinning. Tapping the plates on the
   base zooms in on the winner plate the same way; tapping the upper block
   zooms in on the Monumental Recovery Foundation plate.
   ========================================================================== */

import * as THREE from "../../assets/vendor/three.module.min.js";
import { RoomEnvironment } from "../../assets/vendor/RoomEnvironment.js";
import { buildTrophy, loadTrophyFonts } from "../../assets/event/trophy-model.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;
const YEAR = "2027";
const AWAITING = "AWAITING CHAMPION";

let view = null;      // built lazily on first mount
let failed = false;

export function mountTrophy(host) {
  if (failed) { host.classList.add("no-webgl"); return; }
  if (!view) {
    try { view = createView(); } catch (e) { failed = true; host.classList.add("no-webgl"); return; }
  }
  host.appendChild(view.canvas);
  view.observe(host);
}

/** Show the winner (sub = their facility, on a second line). animate=false just
    sets the plate (e.g. on first load after the reveal). */
export function engrave(label, animate = true, sub = "") {
  if (view) view.engrave(label, animate, sub);
  else pendingLabel = { label, animate, sub };
}
let pendingLabel = null;

function createView() {
  const canvas = document.createElement("canvas");
  canvas.className = "trophy-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.95;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(-4, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 2.4); rim.position.set(5, 4, -6); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xd9c296, 0.8); fill.position.set(4, 1, 5); scene.add(fill);

  let model = null;
  let plateLabel = AWAITING, plateSub = "";
  loadTrophyFonts().then(() => {
    model = buildTrophy(scene.environment);
    scene.add(model.group);
    model.setPlate(YEAR, plateLabel, plateSub);
    if (pendingLabel) { api.engrave(pendingLabel.label, pendingLabel.animate, pendingLabel.sub); pendingLabel = null; }
  });

  /* Motion state -------------------------------------------------------- */
  let angle = -0.5, spin = reduced ? 0 : 0.006;
  let dragging = false, lastX = 0, lastT = 0;
  const cur = { zoom: 1, focus: 0, face: 0 };   // focus: 0 = whole trophy, 1 = winner plate
  let target = { zoom: 1, focus: 0, face: 0 };
  let focusPt = { x: 0, y: 0, zoom: 0.38 };   // where focus = 1 points the camera
  let typing = null;   // { label, sub, start }

  let downX = 0, downY = 0, downT = 0;
  let viewing = null;   // { until } while a tap has zoomed in on the plate
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; lastT = performance.now();
    downX = e.clientX; downY = e.clientY; downT = lastT;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    angle += dx * 0.012;
    spin = (dx * 0.012) / Math.max(16, now - lastT) * 16;
    lastX = e.clientX; lastT = now;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerup", (e) => {
    end();
    // A tap (not a drag): zoom in on the winner plate, or back out if already in.
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > 8 || performance.now() - downT > 450 || !model || typing) return;
    if (viewing) { closeUp(false); return; }
    const which = tapTarget(e);
    if (which) closeUp(which);
  });

  const ray = new THREE.Raycaster();
  /** "winner" for the bottom tier, "name" for the upper block, or null. */
  function tapTarget(e) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...model.plateTier, ...model.nameTier], false)[0];
    if (!hit) return null;
    return model.nameTier.includes(hit.object) ? "name" : "winner";
  }
  function aimAt(which) {
    focusPt = which === "name"
      ? { x: 0, y: model.nameY, zoom: 0.4 }
      : { x: model.plateX, y: model.plateY, zoom: 0.38 };
  }
  function closeUp(which) {
    if (which) {
      aimAt(which);
      viewing = { until: performance.now() + 6000 };
      target = { zoom: focusPt.zoom, focus: 1, face: 1 };
    } else {
      viewing = null;
      target = { zoom: 1, focus: 0, face: 0 };
      spin = reduced ? 0 : 0.03;
    }
  }
  // Pointer cursor over a plate on desktop.
  canvas.addEventListener("pointermove", (e) => {
    if (dragging || !model || e.pointerType !== "mouse") return;
    canvas.style.cursor = tapTarget(e) ? "pointer" : "";
  });

  /* Size follows whichever box the canvas is in -------------------------- */
  let host = null;
  const ro = new ResizeObserver(() => resize());
  function resize() {
    if (!host) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!model || !host || !canvas.isConnected || document.hidden) return;

    const k = reduced ? 1 : 0.06;
    for (const p in target) cur[p] = lerp(cur[p], target[p], k);

    if (!dragging) {
      const rest = reduced ? 0 : 0.006;
      spin = lerp(spin, rest, 0.02);
      angle += spin * (1 - cur.face);
    }
    if (cur.face > 0.01) {
      const front = Math.round(angle / TAU) * TAU;
      angle += (front - angle) * 0.08 * cur.face;
    }
    model.group.rotation.set(0, angle, 0);

    if (viewing && now > viewing.until) closeUp(false);

    if (typing) {
      // Name first, then the facility, letter by letter.
      const t = (now - typing.start - 900) / 2400;
      const nameLen = typing.label.length;
      const total = nameLen + typing.sub.length;
      const n = reduced ? total : Math.max(0, Math.min(total, Math.floor(t * total)));
      if (n !== typing.n) {
        typing.n = n;
        model.setPlate(YEAR, typing.label.slice(0, n), typing.sub.slice(0, Math.max(0, n - nameLen)));
      }
      if (n >= total && now - typing.start > 900 + 2400 + 5000) {
        typing = null;
        target = { zoom: 1, focus: 0, face: 0 };
        spin = reduced ? 0 : 0.03;
      }
    }

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const span = 2 * Math.tan(vFov / 2);
    const fit = Math.max(model.height / (span * 0.82), model.width / (span * camera.aspect * 0.82));
    const dist = fit * cur.zoom;
    const focusY = lerp(model.height * 0.5, focusPt.y, cur.focus);
    const focusX = lerp(0, focusPt.x, cur.focus);
    camera.position.set(focusX, focusY + dist * 0.1, dist);
    camera.lookAt(focusX, focusY, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  const api = {
    canvas,
    observe(el) {
      if (host) ro.unobserve(host);
      host = el;
      ro.observe(el);
      resize();
    },
    engrave(label, animate, sub = "") {
      label = String(label || "").toUpperCase();
      sub = String(sub || "").toUpperCase();
      plateLabel = label;
      plateSub = sub;
      if (!model) { pendingLabel = { label, animate, sub }; return; }
      if (!animate || reduced) { model.setPlate(YEAR, label, sub); return; }
      model.setPlate(YEAR, "", "");
      viewing = null;
      aimAt("winner");
      typing = { label, sub, start: performance.now(), n: -1 };
      target = { zoom: focusPt.zoom, focus: 1, face: 1 };
    },
  };
  return api;
}

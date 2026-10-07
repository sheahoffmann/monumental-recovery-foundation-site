/* ==========================================================================
   Taste of Recovery — the trophy model
   --------------------------------------------------------------------------
   Shared by the gala page (assets/event/event.js) and the guest app (gala/).
   buildTrophy() returns the three.js group plus a setPlate() that re-engraves
   the front winner plate. Camera, lights and animation stay with the caller.
   ========================================================================== */

import * as THREE from "../vendor/three.module.min.js";

const TAU = Math.PI * 2;

/* Canvas text on the plates needs the web fonts; don't wait forever for them. */
export async function loadTrophyFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('800 80px "Playfair Display"'),
        document.fonts.load('italic 700 40px "Playfair Display"'),
        document.fonts.load('700 30px "Karla"'),
        document.fonts.load('500 30px "JetBrains Mono"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fall back to system fonts */ }
}

export function buildTrophy(environment) {
  const trophy = new THREE.Group();

  /* Materials ---------------------------------------------------------- */
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe9ebf0, metalness: 1, roughness: 0.1 });
  const hammered = new THREE.MeshStandardMaterial({
    color: 0xe9ebf0, metalness: 1, roughness: 0.14, side: THREE.DoubleSide,
    bumpMap: makeDimpleMap(), bumpScale: 6,
  });
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: 0x040405, metalness: 0, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.2,
    envMap: environment, envMapIntensity: 0.35,
  });
  const brushedTex = makePlateTexture({ w: 1024, h: 230 });
  const plateEdge = new THREE.MeshStandardMaterial({ color: 0xc9cdd6, metalness: 1, roughness: 0.3 });
  const blankPlate = new THREE.MeshStandardMaterial({ color: 0xffffff, map: brushedTex, metalness: 1, roughness: 0.3 });

  /* Base: lower tier with winner plates on all four sides ---------------- */
  const LOW = { w: 2.3, h: 0.95 };
  const UP = { w: 1.6, h: 1.15 };
  const lower = new THREE.Mesh(new THREE.BoxGeometry(LOW.w, LOW.h, LOW.w), lacquer);
  lower.position.y = LOW.h / 2;
  trophy.add(lower);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(UP.w, UP.h, UP.w), lacquer);
  upper.position.y = LOW.h + UP.h / 2;
  trophy.add(upper);

  // Winner plates: 2 columns x 3 rows per face. The front top-left one is engraved for 2027.
  const PW = 0.98, PH = 0.22, PD = 0.014, GAP_X = 0.08, GAP_Y = 0.07;
  const plateGeo = new THREE.BoxGeometry(PW, PH, PD);
  const winnerCanvas = document.createElement("canvas");
  winnerCanvas.width = 1024; winnerCanvas.height = 230;
  const winnerTex = new THREE.CanvasTexture(winnerCanvas);
  winnerTex.colorSpace = THREE.SRGBColorSpace;
  winnerTex.anisotropy = 8;
  const winnerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: winnerTex, metalness: 1, roughness: 0.3 });
  drawWinnerPlate(winnerCanvas, "", "");

  const plates = [];
  for (let face = 0; face < 4; face++) {
    const side = new THREE.Group();
    side.rotation.y = face * (Math.PI / 2);
    trophy.add(side);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const isWinner = face === 0 && row === 0 && col === 0;
        const front = isWinner ? winnerMat : blankPlate;
        // BoxGeometry face order: +x, -x, +y, -y, +z, -z
        const p = new THREE.Mesh(plateGeo, [plateEdge, plateEdge, plateEdge, plateEdge, front, plateEdge]);
        p.position.set(
          (col === 0 ? -1 : 1) * (PW / 2 + GAP_X / 2),
          LOW.h / 2 + (1 - row) * (PH + GAP_Y),
          LOW.w / 2 + PD / 2
        );
        side.add(p);
        plates.push(p);
      }
    }
  }

  // The name plate on the upper cube.
  const nameTex = makeNamePlateTexture();
  const nameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: nameTex, metalness: 1, roughness: 0.26 });
  const namePlate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.65, 0.018), [plateEdge, plateEdge, plateEdge, plateEdge, nameMat, plateEdge]);
  namePlate.position.set(0, LOW.h + UP.h * 0.52, UP.w / 2 + 0.009);
  trophy.add(namePlate);

  /* Cup: foot, stem and knops as one lathe, the hammered bowl as another ----- */
  const BASE_TOP = LOW.h + UP.h;
  const stemProfile = [
    [0, 0], [0.5, 0], [0.53, 0.025], [0.52, 0.06], [0.44, 0.1], [0.32, 0.16], [0.22, 0.25],
    [0.16, 0.34], [0.2, 0.38], [0.21, 0.42], [0.16, 0.47], [0.1, 0.52], [0.09, 0.6],
    [0.14, 0.64], [0.165, 0.69], [0.13, 0.735], [0.09, 0.77], [0.1, 0.83], [0.19, 0.89],
    [0.27, 0.935], [0.27, 0.95],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const stem = new THREE.Mesh(new THREE.LatheGeometry(stemProfile, 96), chrome);
  stem.position.y = BASE_TOP;
  trophy.add(stem);

  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile(), 128), hammered);
  bowl.position.y = BASE_TOP + 0.93;
  trophy.add(bowl);

  // Rolled rim.
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(1.215, 0.035, 20, 160), chrome);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = BASE_TOP + 0.93 + 0.9;
  trophy.add(rimRing);

  // Soft contact shadow on an invisible floor.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  trophy.add(shadow);

  return {
    group: trophy,
    height: BASE_TOP + 0.93 + 0.95,   // ≈ 3.98
    width: 2.6,                       // widest silhouette while turning
    plateY: LOW.h / 2 + PH + GAP_Y,   // centre of the engraved winner plate (front face, top left)
    plateX: -(PW / 2 + GAP_X / 2),
    plates,                           // every winner plate on the base
    plateTier: [lower, ...plates],    // tap targets: the bottom tier and its plates
    nameTier: [upper, namePlate],     // tap targets: the upper block and the foundation plate
    nameY: LOW.h + UP.h * 0.52,       // centre of the foundation plate
    setPlate(year, label, sub = "") {
      drawWinnerPlate(winnerCanvas, year, label, sub);
      winnerTex.needsUpdate = true;
    },
  };
}

/* ==========================================================================
   Geometry + texture helpers
   ========================================================================== */

/* Bowl cross-section: outer wall (quarter ellipse), lip, then the inner wall
   back down. UV v runs along this list, so makeDimpleMap() targets the outer
   wall by index. */
const BOWL_OUTER = 56, BOWL_INNER = 36;
function bowlProfile() {
  const pts = [];
  for (let i = 0; i < BOWL_OUTER; i++) {
    const th = (i / (BOWL_OUTER - 1)) * (Math.PI / 2);
    pts.push(new THREE.Vector2(0.27 + 0.95 * Math.sin(th), 0.9 * (1 - Math.cos(th))));
  }
  pts.push(new THREE.Vector2(1.215, 0.92), new THREE.Vector2(1.19, 0.93));
  for (let i = BOWL_INNER - 1; i >= 0; i--) {
    const th = (i / (BOWL_INNER - 1)) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, 1.17 * Math.sin(th)), 0.1 + 0.82 * (1 - Math.cos(th))));
  }
  return pts;
}

/* Bump map for the hammered dimples: dark ellipses on white, staggered rows,
   covering the lower-middle of the outer wall and leaving a plain band at the rim. */
function makeDimpleMap() {
  const W = 2048, H = 2048;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const totalPts = BOWL_OUTER + 2 + BOWL_INNER;
  const vOf = (th) => ((th / (Math.PI / 2)) * (BOWL_OUTER - 1)) / (totalPts - 1);
  const ROWS = 6, COLS = 40;
  const th0 = 0.32, th1 = 1.3;
  for (let r = 0; r < ROWS; r++) {
    const a = th0 + ((th1 - th0) * r) / ROWS;
    const b = th0 + ((th1 - th0) * (r + 1)) / ROWS;
    const yTop = (1 - vOf(b)) * H, yBot = (1 - vOf(a)) * H;
    const cy = (yTop + yBot) / 2, rh = (yBot - yTop) * 0.46;
    const cellW = W / COLS;
    for (let col = -1; col <= COLS; col++) {
      const cx = (col + (r % 2 ? 0.5 : 0) + 0.5) * cellW;
      const rw = cellW * 0.46;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rw, rh);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, "#202020");
      g.addColorStop(0.7, "#9a9a9a");
      g.addColorStop(1, "#ffffff");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* Brushed silver ground with a bevelled border. */
function paintBrushed(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#f2f3f6");
  g.addColorStop(0.45, "#c3c8d1");
  g.addColorStop(0.6, "#eef0f3");
  g.addColorStop(1, "#bfc4cd");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Fine horizontal brushing.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < h * 1.4; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "70,75,85"},${0.03 + rnd() * 0.06})`;
    ctx.fillRect(0, rnd() * h, w, 1);
  }
  // Bevel.
  const b = Math.max(6, h * 0.04);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(b, b, w - b * 2, h - b * 2);
  ctx.strokeStyle = "rgba(40,44,52,0.35)";
  ctx.strokeRect(b + 3, b + 3, w - b * 2 - 6, h - b * 2 - 6);
}

function makePlateTexture({ w, h }) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  paintBrushed(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* Year on the left, label on the right, with an optional smaller second line
   under the label (the winning chef's facility). Long text shrinks to fit. */
function drawWinnerPlate(c, year, label, sub = "") {
  const ctx = c.getContext("2d");
  const w = c.width, h = c.height;
  paintBrushed(ctx, w, h);
  ctx.fillStyle = "#24272e";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = '800 92px "Playfair Display", Georgia, serif';
  ctx.fillText(year, w * 0.22, h * 0.52);
  ctx.textAlign = "left";
  const room = w * 0.55;
  // One size for both lines: the largest that fits the longer of the two.
  if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
  let size = 36;
  const setFont = () => { ctx.font = `500 ${size}px "JetBrains Mono", Menlo, monospace`; };
  setFont();
  while (size > 16 && Math.max(ctx.measureText(label).width, ctx.measureText(sub).width) > room) { size -= 2; setFont(); }
  ctx.fillText(label, w * 0.4, sub ? h * 0.38 : h * 0.52);
  if (sub) ctx.fillText(sub, w * 0.4, h * 0.7);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

function makeNamePlateTexture() {
  const W = 1600, H = 800;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  paintBrushed(ctx, W, H);
  const ink = "#23262d";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const spacing = (px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = px; };

  // Ornament
  ctx.font = '700 46px "Playfair Display", Georgia, serif';
  ctx.fillText("✦", W / 2, H * 0.2);

  ctx.font = 'italic 700 70px "Playfair Display", Georgia, serif';
  ctx.fillText("Taste of", W / 2, H * 0.33);
  spacing("10px");
  ctx.font = '800 150px "Playfair Display", Georgia, serif';
  ctx.fillText("RECOVERY", W / 2, H * 0.5);
  spacing("0px");

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.3, H * 0.645); ctx.lineTo(W * 0.46, H * 0.645);
  ctx.moveTo(W * 0.54, H * 0.645); ctx.lineTo(W * 0.7, H * 0.645);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.645, 7, 0, TAU);
  ctx.fill();

  spacing("9px");
  ctx.font = '700 46px "Karla", Arial, sans-serif';
  ctx.fillText("MONUMENTAL RECOVERY FOUNDATION", W / 2, H * 0.75);
  ctx.font = '500 30px "JetBrains Mono", Menlo, monospace';
  ctx.fillStyle = "#4a4f5a";
  ctx.fillText("EST. 2027 · COLORADO SPRINGS", W / 2, H * 0.85);
  spacing("0px");

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.75)");
  g.addColorStop(0.5, "rgba(0,0,0,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

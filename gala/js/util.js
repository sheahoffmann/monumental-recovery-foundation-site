/* Taste of Recovery app — helpers shared by the demo and live backends. */

export function normalizePhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function formatPhone(d) {
  return d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || "";
}

/** Shrink photos before upload so they go up quickly on venue Wi-Fi. */
export async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || !("createImageBitmap" in window)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob || file;
  } catch (e) {
    return file;
  }
}

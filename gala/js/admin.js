/* ==========================================================================
   Taste of Recovery 2027 — staff page (gala/admin.html)
   --------------------------------------------------------------------------
   The same host controls as the app's Host tab (js/host.js), on a page of
   their own for a laptop or tablet. Staff sign in with email and password
   (demo mode: the PIN as the password).
   ========================================================================== */

import * as api from "./api.js";
import { hostHtml, bindHost } from "./host.js";

const root = document.getElementById("admin");

function toast(msg, tone = "") {
  const el = document.createElement("div");
  el.className = "toast " + tone;
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function render() {
  document.getElementById("demo-bar").hidden = !api.DEMO;
  document.getElementById("demo-app").href = "./" + location.search;   // keeps ?demo=1
  if (!api.isStaff()) {
    if (document.getElementById("staff-form")) return;   // keep what's being typed
    root.innerHTML = `
      <form class="card pin" id="staff-form">
        <p class="mono gold">Staff only</p>
        <h2>Staff sign in</h2>
        <label class="lbl" for="st-email">Email</label>
        <input class="field" id="st-email" name="email" type="email" autocomplete="username" ${api.DEMO ? "" : "required"}>
        <label class="lbl" for="st-pw">Password</label>
        <input class="field" id="st-pw" name="password" type="password" autocomplete="current-password" required>
        ${api.DEMO ? `<p class="demo-note">Demo mode: any email, password <b>${api.DEMO_ADMIN_PIN}</b></p>` : ""}
        <p class="error" hidden></p>
        <button class="btn btn-silver btn-block" style="margin-top:14px">Sign in</button>
      </form>`;
    return;
  }
  // Keep what someone is typing.
  if (document.activeElement && root.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  root.innerHTML = hostHtml();
  hydrate();
}

async function hydrate() {
  for (const el of root.querySelectorAll("[data-media]")) {
    const url = await api.mediaUrl(el.dataset.media);
    if (url) el.src = url;
  }
}

root.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id !== "staff-form") return;
  e.preventDefault();
  const btn = f.querySelector("button");
  btn.disabled = true;
  try {
    await api.staffSignIn(f.email.value, f.password.value);
    root.innerHTML = "";
    render();
  } catch (err) {
    const el = f.querySelector(".error");
    el.textContent = err.message;
    el.hidden = false;
    btn.disabled = false;
  }
});

bindHost(root, toast, () => { root.innerHTML = ""; render(); });
root.addEventListener("focusout", () => setTimeout(render, 0));
api.subscribe(render);
render();

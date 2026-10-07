/* ==========================================================================
   Taste of Recovery app — data layer entry point
   --------------------------------------------------------------------------
   Screens import from here. Uses the live Supabase backend (api-live.js)
   when config.js has a project, otherwise (or with ?demo=1) the on-device
   demo (api-demo.js). Both export the same functions.
   ========================================================================== */

import { CONFIG } from "./config.js";

// ?demo=1 switches this device to the demo and remembers it (so the home-screen
// icon opens the demo too); ?demo=0 switches back to live.
const flag = new URLSearchParams(location.search).get("demo");
try {
  if (flag === "1") localStorage.setItem("tor27-demo", "1");
  if (flag === "0") localStorage.removeItem("tor27-demo");
} catch (e) { /* storage blocked */ }
let demoOn = flag === "1";
try { demoOn = demoOn || (flag !== "0" && localStorage.getItem("tor27-demo") === "1"); } catch (e) { /* storage blocked */ }
const live = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey) && !demoOn;
const impl = live ? await import("./api-live.js") : await import("./api-demo.js");
if (impl.init) await impl.init(CONFIG);

export const {
  DEMO, SIGN_IN, MAX_IMAGE_MB, MAX_VIDEO_MB, DEMO_ADMIN_PIN,
  subscribe, normalizePhone, formatPhone,
  me, requestCode, verifyCode, signOut,
  eventState, lots, lot, bidHistory, placeBid, myWins, payForLot,
  myVote, castVote, checkVoteCode, voteResults,
  uploadMedia, media, mediaUrl,
  myFeedback, submitFeedback,
  isStaff, staffSignIn, staffSignOut,
  admin,
} = impl;

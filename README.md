# Monumental Recovery Foundation — website

Hand-coded static site. No framework. Open `index.html` in a browser to preview locally.
Deploys from GitHub: on each push Netlify copies only the public files (HTML pages, `style.css`,
`main.js`, `robots.txt`, `sitemap.xml`, `assets/`) into `_site/` and publishes that, so this README,
`tools/` and the function source stay private. Don't drag the folder into Netlify (that skips this
step). If you add a new public file at the top level, add it to the `command` in `netlify.toml`.

## Files
```
index.html                 Home
story.html                 Story
taste-of-recovery.html     Taste of Recovery 2027 gala page, UNLISTED: noindex, not linked anywhere (3D trophy: assets/event/, three.js in assets/vendor/)
gala/                      Taste of Recovery guest app (installable web app, /gala/), UNLISTED. See "Gala guest app" below
supabase/                  Guest app database setup (schema.sql) and test-data reset (reset-test-data.sql); not published
donate.html                Donate (Stripe Checkout)
contact.html               Contact (Netlify form -> thank-you.html)
apply.html                 Scholarship application: PDF downloads + Submit (email) instructions
sharon.html                Memorial page for Sharon Elaine Bunnett (checks only, noindex)
thank-you.html             Contact form confirmation
next-steps-applicant.html  Shown after the applicant PDF download starts
next-steps-clinician.html  Shown after the clinician PDF download starts
assets/scholarship-application.pdf  Paper version of the application (linked from apply.html)
donation-thank-you.html    Post-donation confirmation (Stripe returns here)
style.css                  All styling (brand tokens at the top)
main.js                    Nav, scroll reveal, headline reveal, donation checkout
netlify.toml               Netlify config (functions directory)
netlify/functions/         Serverless function that talks to Stripe
assets/                    Logos, icon, favicons
```

## Brand
- Navy `#2E3D68`. Page ground is `#F1EBDC`, a slightly deeper creme than the logo's
  `#F5F1E8`, so it still reads warm on bright phone screens. To go back to the exact
  logo creme, change `--creme` and `--surface` at the top of `style.css`.
- Display type: Playfair Display · Body type: Karla (both from Google Fonts)

---

## Turning on Stripe donations

The donate page is already wired. It needs one thing from you: a secret key.

### 1. Create the Stripe account
Sign up at stripe.com as a **nonprofit / company**, using the foundation's legal name,
EIN, and bank account — not a personal account. Stripe will ask for business details
and a bank account for payouts.

### 2. Get your secret key
Stripe dashboard → **Developers → API keys**.
- While testing, use the key starting `sk_test_`
- When you're ready for real money, switch the dashboard out of test mode and copy
  the key starting `sk_live_`

**Never put this key in a file in this folder.** It goes in Netlify only.

### 3. Add the key to Netlify
Netlify → your site → **Site configuration → Environment variables → Add a variable**
```
Key:    STRIPE_SECRET_KEY
Value:  sk_test_...   (then swap to sk_live_... when you go live)
```
Redeploy after adding it.

### 4. Test it
With the test key in place, go to the donate page, pick an amount, and use Stripe's
test card: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP. You should land
on `donation-thank-you.html` and see the payment in your Stripe dashboard's test data.
Try the monthly toggle too — it creates a subscription rather than a one-time charge.

### 5. Go live
Swap the environment variable to your `sk_live_` key and redeploy.

### How it works
`donate.html` posts the amount to `/.netlify/functions/create-checkout-session`, which
creates a Stripe Checkout session and returns its URL. The browser goes to Stripe's
hosted page for the card details, then Stripe returns the donor to
`donation-thank-you.html`. Card data never touches this site, and the secret key never
leaves Netlify's server.

Amounts are validated at $1–$50,000. To change that, edit `MIN_USD` / `MAX_USD` in
`netlify/functions/create-checkout-session.js` and the `min` / `max` on the amount
input in `donate.html`.

### Launching the Taste of Recovery page publicly
It is live but unlisted: reachable only by its URL (monumentalrecovery.org/taste-of-recovery.html).
To make it public:
1. Delete the `<meta name="robots" ...>` tag and the comment under it in `taste-of-recovery.html`.
2. Add `<a href="taste-of-recovery.html">Gala</a>` after the Story link in each page's nav,
   and `<li><a href="taste-of-recovery.html">Taste of Recovery 2027</a></li>` after Story in each footer
   (404.html uses `/taste-of-recovery.html`).
3. Add it to `sitemap.xml`.
4. Remove `hidden` from the `event` option in `contact.html`.

### Golf hole sponsorships (Taste of Recovery page)
Each hole on `taste-of-recovery.html` is a button. Clicking an open hole asks for the
sponsoring facility, then `create-checkout-session` (with `kind: "hole"`) starts a $500
Stripe Checkout. The hole number and facility are saved as metadata on the payment and
shown in the payment description, so they appear in the Stripe dashboard and on the
checkout page. `netlify/functions/golf-holes.js` asks Stripe which holes have a
succeeded payment, and the page turns those gold and disables them. Stripe is the only
record: to free a hole up again, refund the payment in Stripe. Uses the same
`STRIPE_SECRET_KEY`; nothing else to set up.

### Fees and the nonprofit rate
You'll start on Stripe's standard rate. Stripe offers a discounted nonprofit rate, but
eligibility requires tax documentation confirming nonprofit status and at least 80% of
your payment volume coming from tax-deductible donations — so apply once your IRS
determination letter arrives. Request it through Stripe support's nonprofit pricing form.

### Receipts — read this
Stripe emails the donor a **payment receipt**. That is not the same as the
contemporaneous written acknowledgment your bylaws (§7.2) commit you to under
IRC §170(f). You'll need to send those separately, or move to a donation platform
(Donorbox, Givebutter, Zeffy) that generates them automatically. Worth deciding before
you're doing it by hand at volume.

---

## Other things to finish before launch
1. **Email address.** `give@monumentalrecovery.org` is the only address used, and it
   appears in the footer of every page plus the contact, donate, and policy pages.
   It is a live mailbox. If it ever changes, search the whole folder for it.
2. **Domain.** Live at `monumentalrecovery.org` (Netlify, custom domain with Let's
   Encrypt SSL). `www` redirects to the apex. Canonical tags already point there.
3. **501(c)(3) language.** The footer, the donate FAQ, and the donation thank-you page
   all say status is pending. Update all three when the determination letter arrives,
   and add the EIN.
4. **Contact form.** Uses Netlify Forms (`data-netlify="true"`), so it only works once
   deployed to Netlify — enable form notifications in the Netlify dashboard so
   submissions email you.
5. **Scholarship application.** `apply.html` offers two fillable PDFs and a Submit button:
   - `assets/scholarship-application.pdf` (the applicant, 8 pages)
   - `assets/clinical-recommendation.pdf` (the clinician, 2 pages)
   - Pressing **Applicant** or **Clinician** downloads the PDF and then shows a next-steps page.
   - **Submit** opens instructions with buttons that start a new email (mailto link) to
     give@monumentalrecovery.org with the subject filled in. The person attaches the PDF
     themselves. If no mail app opens, the box shows the address with a copy button.

   To change the PDFs, edit the wording in `tools/build_pdfs.py` and re-run it (instructions
   at the top of the file) rather than editing the PDFs by hand.

## Notes
- Copy is grounded in the draft bylaws: direct-to-program disbursement, the Board and
  Scholarship Selection Committee process, conflict-of-interest recusal, uncompensated
  directors, and privacy of recipient information.
- No statistics are quoted anywhere. If you want data points on treatment length or
  cost barriers, add them with a cited source.
- Crisis resources (SAMHSA National Helpline, 988) appear in the footer and on the
  contact page.

---

## Gala guest app (`gala/`)

An installable web app for guests at Taste of Recovery 2027, at `/gala/`. Guests open the
link (or scan a QR code on the tables) and tap **Add to Home Screen**. No app store.
It is `noindex` and not linked from the site.

**Screens:** Home (spinning trophy, live status, countdown), Silent auction (8 lots, live
bidding, outbid alerts, Pay button for winners), Vote (one vote per guest, results after the
reveal), Schedule (three days, "Now" / "Up next"), Chefs (course hidden until the reveal),
Photos & videos (upload, staff approval, gallery), Feedback (five questions, opens after
the gala). `gala/admin.html` is the staff page: open/close the auction and the vote, set an
auto-close time, reveal the winner (engraves the trophy on every phone), mark lots paid,
approve photos, read feedback and download it as CSV.

**Host controls:** staff tap **More → Staff sign in** in the app (email + password from
Supabase → Authentication → Users, listed in `public.staff`) and get a **Host** tab: Start/End
bidding, Start/End voting, the reveal, the feedback form, lots and payments, photo approvals.
`gala/admin.html` shows the same controls on their own page.

**Voting code:** Start voting creates a random 4-digit code, shown only on the Host tab. Announce
it in the room; a guest's first vote needs it (switching dishes afterwards doesn't). Five wrong
codes locks a guest out until staff tap Unlock. "New code" replaces it mid-vote.

**Before the gala:** run `supabase/reset-test-data.sql` in the Supabase SQL Editor to clear
test guests, bids, votes, photos and feedback.

**Editing content:** schedule, courses, chefs, lots (opening bids and minimum raises) and
feedback questions are all in `gala/js/content.js`.

**The trophy** is shared with the gala page: `assets/event/trophy-model.js` builds it,
`assets/event/event.js` animates it on the page and `gala/js/trophy.js` in the app.

### Demo mode (current)
`gala/js/api.js` runs a demo backend: everything is stored in the browser, sign-in codes
are shown on screen instead of texted, and Pay marks a lot paid without charging a card.
Open the app and `admin.html` in two tabs of the same browser to try it end to end (staff
PIN `2027`). "Outbid (test)" on the staff page has a pretend guest outbid you. Add
`?now=2027-06-17T19:30` to the app URL to preview the schedule at a given time.

To preview locally, run a local web server from this folder (opening the file directly
won't work, because the app uses JavaScript modules):
```
python3 -m http.server 8000
```
then open http://localhost:8000/gala/

### Going live (still to do)
Needs a **Supabase** project (database, live updates, photo storage, phone sign-in) with
**Twilio** connected inside Supabase for the text messages, plus the existing
`STRIPE_SECRET_KEY` for auction payments. Once those exist: the database tables and access
rules, a Supabase version of `api.js`, a `netlify/functions/auction-checkout.js` for winners'
payments, outbid and "you won" texts, and real staff logins for `admin.html`. The screens
don't change.

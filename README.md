# Monumental Recovery Foundation — website

Hand-coded static site. No build step, no framework. Open `index.html` in a browser
to preview locally, or drag this whole folder into Netlify to deploy.

## Files
```
index.html                 Home
story.html                 Story
donate.html                Donate (Stripe Checkout)
contact.html               Contact (Netlify form -> thank-you.html)
sharon.html                Memorial page for Sharon Elaine Bunnett (checks only, noindex)
thank-you.html             Contact form confirmation
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
1. **Email addresses.** `info@` and `give@monumentalrecovery.org` appear in
   the footer, contact page, and donate page. Change them if the real addresses differ.
2. **Domain.** Update the `<link rel="canonical">` tags if the final domain is not
   `monumentalrecovery.org`.
3. **501(c)(3) language.** The footer, the donate FAQ, and the donation thank-you page
   all say status is pending. Update all three when the determination letter arrives,
   and add the EIN.
4. **Contact form.** Uses Netlify Forms (`data-netlify="true"`), so it only works once
   deployed to Netlify — enable form notifications in the Netlify dashboard so
   submissions email you.

## Notes
- Copy is grounded in the draft bylaws: direct-to-program disbursement, the Board and
  Scholarship Selection Committee process, conflict-of-interest recusal, uncompensated
  directors, and privacy of recipient information.
- No statistics are quoted anywhere. If you want data points on treatment length or
  cost barriers, add them with a cited source.
- Crisis resources (SAMHSA National Helpline, 988) appear in the footer and on the
  contact page.

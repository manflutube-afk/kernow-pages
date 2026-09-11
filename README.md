# Kernow Pages

A Cloudflare Pages application. The site itself is plain HTML, CSS and
JavaScript — no framework, no build step. The only server-side code is one
Pages Function that handles the contact form.

Served at **https://kernowpages.leodiablo.com**

## Layout

```
wrangler.toml           Pages config. `pages_build_output_dir` points at site/
package.json            Just wrangler + the three scripts below
.dev.vars.example       Template for local secrets — copy to .dev.vars

functions/
  api/contact.js        POST /api/contact — validates the enquiry, sends it
                        via Resend. The file path IS the route.

site/                   Everything here is uploaded as a static asset
  index.html            Home — hero with the live-typing browser mock-up
  work.html             Portfolio, cards link out to the live client sites
  pricing.html          Packages, one-off / monthly toggle, add-ons, FAQ
  about.html            About you
  contact.html          Enquiry form + contact details
  404.html              Not-found page
  _headers              Security headers and cache rules, applied at deploy
  robots.txt
  sitemap.xml
  css/styles.css        Every style on the site. Design tokens at the very top.
  js/main.js            Every behaviour. One guarded block per feature.
  assets/               logo.png (black) and logo-white.png for dark sections,
                        favicons, og-image.jpg, and work/ — the portfolio
                        screenshots, one JPEG per client site
```

## Running it locally

```
npm install
npm run dev
```

That starts `wrangler pages dev`, which serves `site/` *and* runs the contact
function, exactly as production does — clean URLs, `_headers` and all. It
prints the port it picked.

Opening `site/index.html` straight off disk still works for quick CSS tweaks,
but the form won't, because there's no function behind it.

## Deploying

Two routes. Pick one and stick with it — using both leads to confusion about
which deploy is live.

### Git-connected (recommended)

The repo is <https://github.com/manflutube-afk/kernow-pages>.

```
git init
git add .
git commit -m "Kernow Pages as a Cloudflare Pages application"
git branch -M main
git remote add origin https://github.com/manflutube-afk/kernow-pages.git
git push -u origin main
```

Then, in the Cloudflare dashboard:

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, pick
   `kernow-pages`.
2. Framework preset: **None**. Build command: **leave empty**.
   Build output directory: **`site`**.
3. Deploy. Every push to `main` redeploys; every pull request gets its own
   preview URL.
4. Once the project exists, add the API key:
   `npx wrangler pages secret put RESEND_API_KEY`

Check `git status` before that first commit and make sure `.dev.vars` isn't
in it. It's gitignored, but the key is real.

### Direct upload

```
npm run deploy
```

Uploads straight from this machine. No Git involved, no preview branches.

Either way, `npm run tail` streams the live function logs, which is where the
`console.error` lines from a failed send show up.

## The custom domain

The site is branded Kernow Pages but lives on a subdomain of `leodiablo.com`.
Nothing about Pages ties the hostname to the project name — they're unrelated.

1. Pages project → **Custom domains** → **Set up a domain**.
2. Enter `kernowpages.leodiablo.com`.
3. Because `leodiablo.com` is already a zone in the same Cloudflare account,
   Cloudflare adds the CNAME itself. Certificate issue takes a few minutes.

### Adding kernowpages.co.uk later

A Pages project accepts several custom domains at once. When you register the
real domain, add it as a second custom domain, then:

- update `ORIGIN` in every `<link rel="canonical">` and `og:url` tag,
- update `site/robots.txt` and `site/sitemap.xml`,
- add a Cloudflare **Redirect Rule** sending `kernowpages.leodiablo.com/*` to
  the new domain, so the old links keep working and only one URL gets indexed.

Host-level redirects like that belong in a Redirect Rule, not in a `_redirects`
file — `_redirects` only matches paths, not hostnames.

## The contact form

`site/contact.html` posts to `/api/contact`, which is
`functions/api/contact.js`. The function validates the fields, then hands the
enquiry to [Resend](https://resend.com) to deliver.

Two emails go out per submission: the enquiry to `CONTACT_TO`, with reply-to
set to whoever filled the form in, and an acknowledgement back to them saying
you'll be in touch as soon as possible, with reply-to set to you. The
acknowledgement is sent second and is deliberately non-fatal — if someone
mistypes their address the enquiry has still arrived, and they aren't told
anything went wrong.

`js/main.js` intercepts the submit and sends it with `fetch`, so the page never
reloads. On success it opens a native `<dialog>` thank-you pop-up, which gives
Escape, the focus trap and the backdrop for free on phones as well as desktop;
if `<dialog>` isn't available the inline status line underneath still shows. With JavaScript switched off the browser posts the form natively and
the function redirects back to `/contact?sent=1` or `/contact?error=…`, which
the same script picks up on load. Both paths work.

Spam is handled by an off-screen honeypot field named `website`. If it's filled
in, the function returns a normal success response and silently bins the
message — a bot that knows it failed just tries again. If that stops being
enough, add Cloudflare Turnstile.

### Setting it up

`leodiablo.com` is already verified in Resend with sending enabled, so the
defaults in `functions/api/contact.js` are correct as they stand:

| Variable | Value | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_…` | the only one that's actually required |
| `CONTACT_TO` | `contact@leodiablo.com` | where enquiries land |
| `CONTACT_FROM` | `Kernow Pages <enquiries@leodiablo.com>` | must be on a domain verified in Resend |

Locally, the key lives in `.dev.vars` — already set up, and gitignored.

In production it has to be stored against the Pages project. Do this **after**
the first deploy, because the project has to exist first:

```
npx wrangler pages secret put RESEND_API_KEY
```

`CONTACT_TO` and `CONTACT_FROM` only need setting if you want to override the
defaults — either as secrets the same way, or as plain environment variables
in the dashboard.

Until `RESEND_API_KEY` is set on the deployment, the form fails gracefully:
the visitor sees "the form is not configured yet" alongside the direct email
address, and the error is logged to `npm run tail`.

### Receiving contact@leodiablo.com

Resend sends mail; it doesn't receive it. Its domain record for
`leodiablo.com` shows `receiving: disabled`, so something else has to deliver
mail addressed to `contact@`.

The free option is Cloudflare **Email Routing** on the `leodiablo.com` zone —
forward `contact@leodiablo.com` to whichever inbox you actually read. Takes
about two minutes. If you already have mail on the domain through another
provider, it's working and there's nothing to do.

Worth confirming either way: every enquiry the site generates goes to this
address, and the reply-to on each one is set to the enquirer, so you can
answer straight from your inbox.

## Still to do before launch

| What | Where |
| --- | --- |
| `me.jpg` | `site/assets/`, used on the about page |
| Confirm `contact@leodiablo.com` receives mail | Cloudflare Email Routing, see above |
| `RESEND_API_KEY` on the deployment | after first deploy, see above |

## Editing

**Colours and fonts** live in the `:root` block at the top of
`css/styles.css`. Black and white is the backbone — headings, titles, body
text and the dark sections all stay monochrome, which is where the Cornish
feel comes from. The four accents below it (`--coral`, `--sea`, `--sun`,
`--mint`) are for the things you click and the small details. Change `--coral`
and every primary button follows. There are exactly two typefaces, Fraunces
for headings and Outfit for everything else; keep it that way.

**The Cornish lines** are `<p class="kernewek">`, used in four places only —
the home hero, the About heading, the contact card and the footer. They're
meant to be an occasional nod, not a translation layer, so resist adding more.

**Portfolio screenshots** live in `site/assets/work/`. They're 880×550 JPEGs
shown in each client's own colours, with a gentle zoom on hover. To refresh
one, screenshot the live site at 1280×900, crop the top to 8:5 and save it
over the existing file.

**Prices** live in `pricing.html`. Each one is a
`<span class="price-value" data-oneoff="£295" data-monthly="£29">` — change both
numbers and the toggle keeps working.

**The header and footer** are copy-pasted identically into every page. Change
one and find-and-replace across the rest.

**Portfolio cards** are in `work.html`. The thumbnails are gradient tiles with
the business name in them. For real screenshots, drop them in `assets/` and
replace `<div class="work-card__thumb">Name</div>` with
`<img class="work-card__thumb" src="assets/name.jpg" alt="…">`.

**Cache busting.** The stylesheet and script are linked with a version
string — `css/styles.css?v=20260911`. The HTML itself is never cached, but the
CSS and JS are held by browsers for an hour, so without this a visitor who saw
the old design keeps seeing it. **Whenever you change `styles.css` or
`main.js`, bump that number in all six HTML files** (find and replace the
date). Otherwise your changes won't reach anyone who has been to the site
before — including you.

**Security headers** are in `site/_headers`. The Content-Security-Policy there
allows Google Fonts and nothing else — if you add a third-party script, an
embedded map or a tracking pixel, it will be blocked until you add its origin.

## Accessibility and motion

Skip link, visible focus rings, semantic headings and alt text are already in.
All animation switches off for anyone with "reduce motion" turned on — keep
that `@media (prefers-reduced-motion: reduce)` block at the bottom of the
stylesheet if you add new effects.

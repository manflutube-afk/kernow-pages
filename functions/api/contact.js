/* =========================================================
   POST /api/contact — the enquiry form's back end.

   A Cloudflare Pages Function. The file's path is the route:
   functions/api/contact.js  ->  /api/contact

   It validates the submission, then hands it to Resend to
   deliver. Nothing is stored anywhere.

   Secrets it needs (see README):
     RESEND_API_KEY   required
     CONTACT_TO       optional, defaults below
     CONTACT_FROM     optional, defaults below — must be an
                      address on a domain verified in Resend
   ========================================================= */

const DEFAULT_TO = 'contact@leodiablo.com';
const DEFAULT_FROM = 'Kernow Pages <enquiries@leodiablo.com>';

const LIMITS = { name: 100, business: 120, email: 200, phone: 40, budget: 60, message: 4000 };

export async function onRequestPost({ request, env }) {
  let fields;
  try {
    fields = await readFields(request);
  } catch {
    return fail(request, 'We could not read that submission.', 400);
  }

  // Honeypot. Real people never see this field, so anything in it is a bot.
  // Answer as if it worked — a bot that knows it failed just tries again.
  if (fields.website) return succeed(request);

  const errors = validate(fields);
  if (errors.length) return fail(request, errors[0], 400);

  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set on this deployment');
    return fail(request, 'The form is not configured yet.', 500);
  }

  const to = env.CONTACT_TO || DEFAULT_TO;
  const from = env.CONTACT_FROM || DEFAULT_FROM;

  // The enquiry itself. If this can't be sent, the whole thing failed.
  const sent = await send(env, {
    from,
    to: [to],
    reply_to: fields.email,
    subject: `Website enquiry — ${fields.name}${fields.business ? ` (${fields.business})` : ''}`,
    text: plainBody(fields, request),
    html: htmlBody(fields, request)
  });

  if (!sent.ok) {
    console.error('Enquiry send failed:', sent.error);
    return fail(request, 'We could not send that just now.', 502);
  }

  // The acknowledgement to whoever filled the form in. Deliberately after the
  // enquiry and deliberately not fatal — if this bounces because they mistyped
  // their address, the enquiry has still arrived and the visitor shouldn't be
  // told anything went wrong.
  // Which domain this was submitted from, so the logo and the link in the
  // acknowledgement always point at the site the visitor was actually on.
  const site = env.SITE_URL || new URL(request.url).origin;

  const ack = await send(env, {
    from,
    to: [fields.email],
    reply_to: to,
    subject: 'Thanks for getting in touch — Kernow Pages',
    text: ackText(fields, site, to),
    html: ackHtml(fields, site, to)
  });

  if (!ack.ok) console.error('Acknowledgement send failed:', ack.error);

  return succeed(request);
}

/* ---- Sending ---- */

async function send(env, payload) {
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
  return { ok: true };
}

/* Anything that isn't a POST gets a straight answer rather than the 404 page. */
export function onRequest() {
  return json({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}

/* ---- Replying ----
   A fetch() from js/main.js asks for JSON. A browser posting the form with
   JavaScript switched off asks for HTML, and gets sent back to the contact
   page with the outcome in the query string instead. */

function wantsJson(request) {
  return (request.headers.get('accept') || '').includes('application/json');
}

function succeed(request) {
  return wantsJson(request) ? json({ ok: true }) : back(request, '/contact?sent=1');
}

function fail(request, message, status) {
  return wantsJson(request)
    ? json({ ok: false, error: message }, status)
    : back(request, '/contact?error=' + encodeURIComponent(message));
}

function back(request, path) {
  return Response.redirect(new URL(path, request.url).toString(), 303);
}

/* ---- Reading ---- */

async function readFields(request) {
  const type = request.headers.get('content-type') || '';
  const raw = type.includes('application/json')
    ? await request.json()
    : Object.fromEntries(await request.formData());

  const clean = {};
  for (const key of ['name', 'business', 'email', 'phone', 'budget', 'message', 'website']) {
    clean[key] = String(raw[key] ?? '').trim().slice(0, LIMITS[key] || 200);
  }
  return clean;
}

/* ---- Validating ---- */

function validate(f) {
  const errors = [];
  if (!f.name) errors.push('Please tell me your name.');
  if (!f.email) errors.push('Please add an email address so I can reply.');
  else if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(f.email)) errors.push("That email address doesn't look right.");
  if (!f.message) errors.push('Please tell me a little about what you need.');
  else if (f.message.length < 10) errors.push('Could you give me a bit more detail?');
  return errors;
}

/* ---- Formatting ---- */

function plainBody(f, request) {
  return [
    `Name:     ${f.name}`,
    `Business: ${f.business || '—'}`,
    `Email:    ${f.email}`,
    `Phone:    ${f.phone || '—'}`,
    `Budget:   ${f.budget || '—'}`,
    '',
    f.message,
    '',
    '—',
    `Sent from the Kernow Pages contact form, ${new Date().toUTCString()}`,
    `Country: ${request.headers.get('cf-ipcountry') || 'unknown'}`
  ].join('\n');
}

function htmlBody(f, request) {
  const row = (label, value) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#12395C;font-weight:600">${esc(label)}</td>` +
    `<td style="padding:4px 0;color:#07203A">${esc(value || '—')}</td></tr>`;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#07203A;line-height:1.5">
  <h2 style="margin:0 0 16px;font-size:18px">Website enquiry</h2>
  <table style="border-collapse:collapse;font-size:14px">
    ${row('Name', f.name)}
    ${row('Business', f.business)}
    ${row('Email', f.email)}
    ${row('Phone', f.phone)}
    ${row('Budget', f.budget)}
  </table>
  <p style="margin:20px 0 6px;color:#12395C;font-weight:600;font-size:14px">What they need</p>
  <p style="margin:0;white-space:pre-wrap;font-size:14px">${esc(f.message)}</p>
  <hr style="margin:24px 0;border:0;border-top:1px solid rgba(7,32,58,.12)">
  <p style="margin:0;font-size:12px;color:rgba(7,32,58,.62)">
    Sent from the Kernow Pages contact form &middot; ${esc(new Date().toUTCString())}
    &middot; country: ${esc(request.headers.get('cf-ipcountry') || 'unknown')}
  </p>
</div>`;
}

/* ---- The acknowledgement ---- */

function ackText(f, site, replyTo) {
  const first = f.name.split(" ")[0] || f.name;
  return [
    "Hi " + first + ",",
    "",
    "Thanks for getting in touch about your website — your enquiry has come through",
    "and I'll get back to you as soon as I possibly can.",
    "",
    "I read every one of these myself, so you'll be replying to a person and not a",
    "queue. If anything has changed in the meantime, just reply to this email and it",
    "comes straight to me.",
    "",
    "Here's what you sent me:",
    "",
    f.message,
    "",
    "—",
    "Kernow Pages",
    "A small business helping small businesses",
    site,
    replyTo
  ].join("\n");
}

function ackHtml(f, site, replyTo) {
  const first = esc(f.name.split(' ')[0] || f.name);
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#000;line-height:1.6;max-width:560px">
  <a href="${site}" style="display:inline-block;text-decoration:none">
    <img src="${site}/assets/email-logo.png" alt="Kernow Pages"
         width="220" style="width:220px;max-width:100%;height:auto;display:block;border:0">
  </a>
  <hr style="margin:18px 0 24px;border:0;border-top:1px solid rgba(0,0,0,.12)">
  <p style="margin:0 0 16px">Hi ${first},</p>
  <p style="margin:0 0 16px">Thanks for getting in touch about your website — your enquiry has come
    through and <strong>I'll get back to you as soon as I possibly can</strong>.</p>
  <p style="margin:0 0 16px">I read every one of these myself, so you'll be replying to a person and
    not a queue. If anything's changed in the meantime, just reply to this email and it comes
    straight to me.</p>
  <p style="margin:24px 0 6px;font-weight:600;font-size:14px">Here's what you sent me</p>
  <p style="margin:0;padding:14px 16px;background:#F4F4F2;border-radius:12px;white-space:pre-wrap;font-size:14px">${esc(f.message)}</p>
  <hr style="margin:28px 0 16px;border:0;border-top:1px solid rgba(0,0,0,.12)">
  <p style="margin:0;font-size:13px;color:rgba(0,0,0,.62)">
    <strong style="color:#000">Kernow Pages</strong><br>
    A small business helping small businesses<br>
    <a href="${site}" style="color:#0E7C86;font-weight:600">${prettyHost(site)}</a><br>
    <a href="mailto:${esc(replyTo)}" style="color:#0E7C86">${esc(replyTo)}</a>
  </p>
</div>`;
}

function prettyHost(site) {
  try { return new URL(site).host; } catch (e) { return site; }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

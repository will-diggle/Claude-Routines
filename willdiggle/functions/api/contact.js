/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Handles contact form submissions and emails them on via Resend.
 * Configure in the Cloudflare dashboard (Settings > Environment variables):
 *   RESEND_API_KEY  - secret, from resend.com
 *   CONTACT_TO      - where enquiries land, e.g. williamdiggz@gmail.com
 *   CONTACT_FROM    - a verified sender on your domain, e.g. site@willdiggle.co.uk
 */

const MAX_FIELD = 5000;

function bad(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

function clean(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function onRequestPost({ request, env }) {
  let form;
  try {
    const type = request.headers.get('content-type') || '';
    form = type.includes('application/json')
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return bad('Could not read the form submission.');
  }

  // Honeypot: real people leave this hidden field empty, bots fill it in.
  if (clean(form.website)) return Response.json({ ok: true });

  const name = clean(form.name);
  const email = clean(form.email);
  const message = clean(form.message);
  const subject = clean(form.subject) || 'Website enquiry';

  if (!name || !email || !message) {
    return bad('Please fill in your name, email and message.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad('That email address does not look right.');
  }

  if (!env.RESEND_API_KEY) {
    return bad('The contact form is not configured yet.', 500);
  }

  const body = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    '',
    message,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM || 'Website <onboarding@resend.dev>',
      to: [env.CONTACT_TO || 'williamdiggz@gmail.com'],
      reply_to: email,
      subject: `${subject} — from ${name}`,
      text: body,
      html: `<pre style="font:14px/1.5 system-ui">${escapeHtml(body)}</pre>`,
    }),
  });

  if (!res.ok) {
    console.error('Resend failed', res.status, await res.text());
    return bad('Sorry — the message could not be sent. Please email directly.', 502);
  }

  return Response.json({ ok: true });
}

export function onRequest() {
  return new Response('Method not allowed', { status: 405 });
}

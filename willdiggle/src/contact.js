/**
 * Contact form handler for POST /api/contact.
 *
 * Emails submissions on via Resend. RESEND_API_KEY is a secret set with
 * `wrangler secret put`; CONTACT_TO and CONTACT_FROM live in wrangler.toml.
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

export async function handleContact(request, env) {
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

  // The home page form asks for a single name, the contact page splits it.
  const name = [clean(form.name), clean(form.first), clean(form.last)]
    .filter(Boolean)
    .join(' ');
  const email = clean(form.email);
  const phone = clean(form.phone);
  const message = clean(form.message);
  const subject = clean(form.subject) || 'Website enquiry';

  if (!name || !email || !message) {
    return bad('Please add your name, email and message.');
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
    phone ? `Phone: ${phone}` : null,
    `Subject: ${subject}`,
    '',
    message,
  ].filter((line) => line !== null).join('\n');

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

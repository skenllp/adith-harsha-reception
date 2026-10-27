/**
 * POST /api/rsvp   (Vercel Serverless Function)
 *
 * Validates the RSVP on the server and forwards it to the backend you configure
 * with environment variables. No secrets ever reach the browser.
 *
 *   RSVP_WEBHOOK_URL     required  e.g. a Google Apps Script web-app URL (see README.md)
 *   RSVP_WEBHOOK_SECRET  optional  shared secret, sent to the webhook as "secret"
 *
 * If RSVP_WEBHOOK_URL is not set, this returns 503 and NOTHING is saved —
 * the form then tells the guest it could not record the RSVP (it never pretends).
 */
'use strict';

const MAX_GUESTS = 10;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }

  /* honeypot — pretend success so bots learn nothing, store nothing */
  if (clean(body.website, 100)) return res.status(200).json({ ok: true });

  const name = clean(body.name, 80);
  const attending = body.attending === 'yes' ? 'yes' : body.attending === 'no' ? 'no' : '';
  const phone = clean(body.phone, 20);
  const message = String(body.message == null ? '' : body.message).replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 500);
  const id = clean(body.id, 64);
  let guests = attending === 'yes' ? Number(body.guests) : 0;

  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Please enter your full name.' });
  if (!attending) return res.status(400).json({ ok: false, error: 'Please let us know whether you will attend.' });
  if (attending === 'yes' && !(Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS)) {
    return res.status(400).json({ ok: false, error: 'Please enter between 1 and ' + MAX_GUESTS + ' guests.' });
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!/^[+\d][\d\s\-()]*$/.test(phone) || digits.length < 7 || digits.length > 15) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid contact number, or leave it blank.' });
    }
  }

  const url = process.env.RSVP_WEBHOOK_URL;
  if (!url) {
    console.error('[RSVP] RSVP_WEBHOOK_URL is not set — RSVP was NOT saved.');
    return res.status(503).json({ ok: false, error: 'RSVP is not available right now.' });
  }

  const record = {
    id,
    receivedAt: new Date().toISOString(),
    name,
    attending: attending === 'yes' ? 'Joyfully Accept' : 'Regretfully Decline',
    guests,
    phone,
    message,
    secret: process.env.RSVP_WEBHOOK_SECRET || ''
  };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, /* Apps Script friendly (no CORS preflight) */
      body: JSON.stringify(record),
      redirect: 'follow',
      signal: ctrl.signal
    });
    clearTimeout(t);
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch (e) {}
    if (!r.ok || !data || data.ok !== true) {
      console.error('[RSVP] Webhook did not confirm the save:', r.status, text.slice(0, 200));
      return res.status(502).json({ ok: false, error: 'Could not save RSVP.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[RSVP] Webhook request failed:', err && err.message);
    return res.status(502).json({ ok: false, error: 'Could not save RSVP.' });
  }
};

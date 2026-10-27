/* =============================================================
   RSVP form  ·  Adith & Harsha — Wedding Reception
   Posts JSON to /api/rsvp (see api/rsvp.js and README.md).
   Nothing is shown as "saved" unless the server confirms it.
   ============================================================= */
(function () {
  'use strict';

  var form = document.getElementById('rsvpForm');
  if (!form) return;

  var $ = function (id) { return document.getElementById(id); };
  var nameEl = $('rsvpName'), guestsEl = $('rsvpGuests'), guestsField = $('rsvpGuestsField'),
      phoneEl = $('rsvpPhone'), msgEl = $('rsvpMsg'), submitBtn = $('rsvpSubmit'),
      formErr = $('rsvpFormErr'), done = $('rsvpDone'),
      doneTitle = $('rsvpDoneTitle'), doneText = $('rsvpDoneText'), again = $('rsvpAgain');

  var ENDPOINT = form.getAttribute('data-endpoint') || '/api/rsvp';
  var STORE_KEY = 'adith-harsha-rsvp-v1';
  var MAX_GUESTS = 10;
  var sending = false;

  /* one id per submission attempt → server/sheet can ignore a double-send */
  function newId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  var submissionId = newId();

  function attending() {
    var r = form.querySelector('input[name="attending"]:checked');
    return r ? r.value : '';
  }

  function setErr(inputEl, errId, msg) {
    var p = $(errId);
    if (p) p.textContent = msg || '';
    if (inputEl) {
      if (msg) inputEl.setAttribute('aria-invalid', 'true');
      else inputEl.removeAttribute('aria-invalid');
    }
  }

  function clearErrors() {
    setErr(nameEl, 'rsvpNameErr', '');
    setErr(null, 'rsvpAttendErr', '');
    setErr(guestsEl, 'rsvpGuestsErr', '');
    setErr(phoneEl, 'rsvpPhoneErr', '');
    formErr.textContent = '';
  }

  /* show guests only when accepting */
  function syncGuests() {
    var yes = attending() === 'yes';
    guestsField.hidden = !yes;
    guestsEl.disabled = !yes;
  }
  form.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'attending') {
      syncGuests();
      setErr(null, 'rsvpAttendErr', '');
    }
  });

  /* stepper */
  function clampGuests(v) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = 1;
    return Math.max(1, Math.min(MAX_GUESTS, v));
  }
  $('rsvpMinus').addEventListener('click', function () { guestsEl.value = clampGuests((parseInt(guestsEl.value, 10) || 1) - 1); });
  $('rsvpPlus').addEventListener('click', function () { guestsEl.value = clampGuests((parseInt(guestsEl.value, 10) || 0) + 1); });

  nameEl.addEventListener('input', function () { if (nameEl.value.trim()) setErr(nameEl, 'rsvpNameErr', ''); });
  phoneEl.addEventListener('input', function () { setErr(phoneEl, 'rsvpPhoneErr', ''); });

  function validate() {
    clearErrors();
    var ok = true, first = null;

    var name = nameEl.value.replace(/\s+/g, ' ').trim();
    if (name.length < 2) {
      setErr(nameEl, 'rsvpNameErr', 'Please enter your full name.');
      first = first || nameEl; ok = false;
    }

    var att = attending();
    if (!att) {
      setErr(null, 'rsvpAttendErr', 'Please let us know whether you will attend.');
      first = first || form.querySelector('input[name="attending"]'); ok = false;
    }

    if (att === 'yes') {
      var g = Number(guestsEl.value);
      if (!/^\d+$/.test(String(guestsEl.value).trim()) || g < 1 || g > MAX_GUESTS) {
        setErr(guestsEl, 'rsvpGuestsErr', 'Please enter between 1 and ' + MAX_GUESTS + ' guests.');
        first = first || guestsEl; ok = false;
      }
    }

    var phone = phoneEl.value.trim();
    if (phone) {
      var digits = phone.replace(/\D/g, '');
      if (!/^[+\d][\d\s\-()]*$/.test(phone) || digits.length < 7 || digits.length > 15) {
        setErr(phoneEl, 'rsvpPhoneErr', 'Please enter a valid contact number, or leave it blank.');
        first = first || phoneEl; ok = false;
      }
    }

    if (!ok && first) {
      try { first.focus({ preventScroll: false }); } catch (e) { first.focus(); }
    }
    return ok;
  }

  function setBusy(b) {
    sending = b;
    submitBtn.disabled = b;
    submitBtn.classList.toggle('is-busy', b);
    submitBtn.setAttribute('aria-busy', b ? 'true' : 'false');
    submitBtn.querySelector('.rsvp-submit__label').textContent = b ? 'Sending…' : 'Confirm RSVP';
  }

  function firstName(full) {
    return full.split(' ')[0] || full;
  }

  function showDone(payload, silent) {
    var yes = payload.attending === 'yes';
    var who = firstName(payload.name);
    if (yes) {
      doneTitle.textContent = 'Thank you, ' + who + '!';
      doneText.textContent = payload.guests > 1
        ? 'Your joyful acceptance for ' + payload.guests + ' guests has been received. We look forward to celebrating with you on Tuesday, 8 December 2026.'
        : 'Your joyful acceptance has been received. We look forward to celebrating with you on Tuesday, 8 December 2026.';
    } else {
      doneTitle.textContent = 'Thank you for letting us know, ' + who + '.';
      doneText.textContent = 'We will miss you at the celebration, and we are grateful for your blessings and good wishes.';
    }
    form.hidden = true;
    done.hidden = false;
    if (silent) return;
    try { done.focus({ preventScroll: true }); } catch (e) {}
    var card = done.closest('.rsvp-card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* remember that this browser already responded (only the first name, for the greeting) */
  function remember(payload) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        name: payload.name, attending: payload.attending, guests: payload.guests, t: Date.now()
      }));
    } catch (e) {}
  }
  function recall() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;                 /* no double-taps */
    if (!validate()) return;

    var att = attending();
    var payload = {
      id: submissionId,
      name: nameEl.value.replace(/\s+/g, ' ').trim(),
      attending: att,
      guests: att === 'yes' ? clampGuests(guestsEl.value) : 0,
      phone: phoneEl.value.trim(),
      message: msgEl.value.trim(),
      website: form.elements.website ? form.elements.website.value : '',
      submittedAt: new Date().toISOString()
    };

    setBusy(true);
    formErr.textContent = '';

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);

    var isAppsScript = ENDPOINT.indexOf('script.google.com') !== -1;
    var fetchHeaders = isAppsScript
      ? { 'Content-Type': 'text/plain;charset=utf-8' }
      : { 'Content-Type': 'application/json' };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok && data && data.ok === true, status: res.status, data: data };
      });
    }).then(function (r) {
      clearTimeout(timer);
      if (r.ok) {
        remember(payload);
        showDone(payload);
        setBusy(false);
        return;
      }
      if (r.status === 503) { try { console.warn('[RSVP] Backend is not configured yet — see README.md'); } catch (e) {} }
      var msg = (r.status === 400 && r.data && r.data.error)
        ? r.data.error
        : 'We could not record your RSVP just now. Please try again in a little while.';
      formErr.textContent = msg;
      setBusy(false);
    }).catch(function () {
      clearTimeout(timer);
      formErr.textContent = 'We could not reach the server. Please check your connection and try again.';
      setBusy(false);
    });
  });

  /* respond for another family member / guest */
  again.addEventListener('click', function () {
    form.reset();
    clearErrors();
    syncGuests();
    submissionId = newId();
    done.hidden = true;
    form.hidden = false;
    try { nameEl.focus(); } catch (e) {}
  });

  /* if this browser already responded, greet them instead of showing a blank form */
  var prev = recall();
  if (prev && prev.name && prev.attending) {
    showDone({ name: prev.name, attending: prev.attending, guests: prev.guests || 1 }, true);
  }

  syncGuests();
})();

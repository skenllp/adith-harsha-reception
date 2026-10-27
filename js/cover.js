/* ==========================================================================
   Cover Invitation — behaviour (vanilla JS, no dependencies)
   1. Loader: hides after fonts are ready (min display time + safety net)
   2. Gate:   locks page scroll until "Open Invitation" is clicked
   3. Ripple: click ripple on any .cv-btn--ripple
   Fires an `invitation:opened` event on document when the gate is opened —
   hook your music / page-entrance / reveal animations to that.
   ========================================================================== */
(function () {
  'use strict';

  /* 1. Loader ------------------------------------------------------------ */
  var loader     = document.getElementById('cv-loader');
  var START_MS   = Date.now();
  var MIN_MS     = 1600;          /* minimum time the loader stays visible */
  var loaderDone = false;

  function hideLoader() {
    if (loaderDone) return;
    loaderDone = true;
    var wait = Math.max(0, MIN_MS - (Date.now() - START_MS));
    setTimeout(function () {
      if (loader) loader.classList.add('is-hidden');
    }, wait);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(hideLoader).catch(hideLoader);
  } else {
    window.addEventListener('load', hideLoader);
  }
  setTimeout(hideLoader, 4000);  /* safety net */

  /* 2. Gate -------------------------------------------------------------- */
  var gate    = document.getElementById('cv-gate');
  var openBtn = document.getElementById('cv-open-btn');

  if (gate && openBtn) {
    document.body.style.overflow = 'hidden';

    openBtn.addEventListener('click', function () {
      gate.classList.add('is-open');

      setTimeout(function () {
        document.body.style.overflow = '';
        document.dispatchEvent(new CustomEvent('invitation:opened'));
      }, 600);
    });
  }

  /* 3. Ripple ------------------------------------------------------------ */
  document.querySelectorAll('.cv-btn--ripple').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 1.4;
      var r = document.createElement('span');
      r.className    = 'cv-ripple';
      r.style.width  = size + 'px';
      r.style.height = size + 'px';
      r.style.left   = (e.clientX - rect.left - size / 2) + 'px';
      r.style.top    = (e.clientY - rect.top  - size / 2) + 'px';
      btn.appendChild(r);
      r.addEventListener('animationend', function () { r.remove(); });
    });
  });
})();

/* ============================================================
   Golden dust · glowing stars · soft bubbles
   One canvas, landing → footer. Pre-rendered sprites, additive
   blending, single rAF loop, DPR capped. Ends with the particles
   converging into the words THANK YOU.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('particles');
  if (!canvas || !canvas.getContext) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ctx = canvas.getContext('2d', { alpha: true });
  var TAU = Math.PI * 2;

  var W = 0, H = 0, DPR = 1;
  var parts = [];
  var sprites = [];
  var running = false, rafId = 0, lastT = 0;

  /* finale state machine: free → gather → glow → ascend → done */
  var phase = 'free';
  var phaseStart = 0;
  var armed = false;
  var targets = [];
  var stageEl = null;
  var stageBaseTop = 0;
  var stageShift = 0;
  var rectTick = 0;

  var GATHER_MS = 2600;
  var GLOW_MS = 1900;
  var ASCEND_MS = 4200;

  /* ---------- sprites ---------- */
  function makeSprite(kind) {
    var s = 64, h = s / 2;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');

    if (kind === 0) {                                   /* golden dust */
      var gd = g.createRadialGradient(h, h, 0, h, h, h);
      gd.addColorStop(0, 'rgba(255,240,206,1)');
      gd.addColorStop(0.22, 'rgba(255,208,128,0.72)');
      gd.addColorStop(0.58, 'rgba(206,152,54,0.20)');
      gd.addColorStop(1, 'rgba(206,152,54,0)');
      g.fillStyle = gd;
      g.beginPath(); g.arc(h, h, h, 0, TAU); g.fill();

    } else if (kind === 1) {                            /* glowing star */
      var gs = g.createRadialGradient(h, h, 0, h, h, h * 0.34);
      gs.addColorStop(0, 'rgba(255,250,232,1)');
      gs.addColorStop(0.5, 'rgba(255,214,148,0.55)');
      gs.addColorStop(1, 'rgba(255,196,110,0)');
      g.fillStyle = gs;
      g.beginPath(); g.arc(h, h, h * 0.34, 0, TAU); g.fill();

      var gsp = g.createRadialGradient(h, h, 0, h, h, h);
      gsp.addColorStop(0, 'rgba(255,246,220,0.95)');
      gsp.addColorStop(0.35, 'rgba(255,214,148,0.34)');
      gsp.addColorStop(1, 'rgba(255,196,110,0)');
      g.fillStyle = gsp;
      g.save(); g.translate(h, h);
      for (var i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-h * 0.07, -h * 0.45);
        g.lineTo(0, -h * 0.96);
        g.lineTo(h * 0.07, -h * 0.45);
        g.closePath();
        g.fill();
        g.rotate(Math.PI / 2);
      }
      g.restore();

    } else {                                            /* soft bubble */
      var gb = g.createRadialGradient(h, h * 0.8, 0, h, h, h * 0.72);
      gb.addColorStop(0, 'rgba(255,248,228,0.30)');
      gb.addColorStop(0.72, 'rgba(255,226,176,0.07)');
      gb.addColorStop(1, 'rgba(255,226,176,0)');
      g.fillStyle = gb;
      g.beginPath(); g.arc(h, h, h * 0.72, 0, TAU); g.fill();

      g.strokeStyle = 'rgba(255,240,212,0.42)';
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(h, h, h * 0.66, 0, TAU); g.stroke();
    }
    return c;
  }

  /* ---------- sizing ---------- */
  function baseCount() {
    var n = (W * H) / 12500;
    return Math.max(52, Math.min(132, Math.round(n)));
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ---------- particles ---------- */
  function spawn(fromEdge) {
    var kind = Math.random() < 0.66 ? 0 : (Math.random() < 0.62 ? 1 : 2);
    var r = kind === 2
      ? 5 + Math.random() * 9
      : (kind === 1 ? 3 + Math.random() * 4 : 1.6 + Math.random() * 3.4);

    var p = {
      k: kind,
      x: Math.random() * W,
      y: Math.random() * H,
      r: r,
      vx: (Math.random() - 0.5) * 0.09,
      vy: -(0.035 + Math.random() * 0.115),
      a: 0,
      aMax: kind === 2 ? 0.16 + Math.random() * 0.16
        : (kind === 1 ? 0.34 + Math.random() * 0.4 : 0.22 + Math.random() * 0.36),
      tw: Math.random() * TAU,
      tws: 0.0009 + Math.random() * 0.0022,
      sw: Math.random() * TAU,
      sws: 0.00035 + Math.random() * 0.0009,
      swr: 6 + Math.random() * 20,
      tx: 0, ty: 0, has: false, fade: 1
    };

    if (fromEdge) {
      var side = (Math.random() * 4) | 0;
      if (side === 0) { p.x = Math.random() * W; p.y = H + 30; }
      else if (side === 1) { p.x = -30; p.y = Math.random() * H; }
      else if (side === 2) { p.x = W + 30; p.y = Math.random() * H; }
      else { p.x = Math.random() * W; p.y = -30; }
    }
    return p;
  }

  function build() {
    parts.length = 0;
    var n = baseCount();
    for (var i = 0; i < n; i++) {
      var p = spawn(false);
      p.a = p.aMax;
      parts.push(p);
    }
  }

  /* ---------- THANK YOU point cloud ---------- */
  function sampleText(rect, maxPts) {
    var cw = Math.max(240, Math.min(Math.round(rect.width), 1000));
    var ch = Math.max(110, Math.min(Math.round(rect.height), 340));
    var off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    var o = off.getContext('2d');

    var fam = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
    var twoLines = cw < 560;
    var lines = twoLines ? ['THANK', 'YOU'] : ['THANK YOU'];
    var size = twoLines ? Math.min(ch * 0.44, cw * 0.30) : Math.min(ch * 0.66, cw * 0.19);

    o.textAlign = 'center';
    o.textBaseline = 'middle';
    if ('letterSpacing' in o) o.letterSpacing = Math.round(size * 0.11) + 'px';

    /* shrink to fit */
    for (var guard = 0; guard < 22; guard++) {
      o.font = '600 ' + size + 'px ' + fam;
      var widest = 0;
      for (var li = 0; li < lines.length; li++) {
        widest = Math.max(widest, o.measureText(lines[li]).width);
      }
      if (widest <= cw * 0.92) break;
      size *= 0.93;
      if ('letterSpacing' in o) o.letterSpacing = Math.round(size * 0.11) + 'px';
    }

    o.fillStyle = '#fff';
    var lh = size * 1.02;
    var y0 = ch / 2 - ((lines.length - 1) * lh) / 2;
    for (var j = 0; j < lines.length; j++) {
      o.fillText(lines[j], cw / 2, y0 + j * lh);
    }

    var data;
    try { data = o.getImageData(0, 0, cw, ch).data; }
    catch (e) { return []; }

    function pick(stride) {
      var out = [];
      for (var y = 0; y < ch; y += stride) {
        for (var x = 0; x < cw; x += stride) {
          if (data[(y * cw + x) * 4 + 3] > 140) out.push(x, y);
        }
      }
      return out;
    }

    var stride = 4, flat = pick(stride);
    while (flat.length / 2 > maxPts && stride < 22) {
      stride += 1;
      flat = pick(stride);
    }

    var sx = rect.width / cw, sy = rect.height / ch;
    var pts = [];
    for (var i = 0; i < flat.length; i += 2) {
      pts.push({ x: rect.left + flat[i] * sx, y: rect.top + flat[i + 1] * sy });
    }
    /* shuffle so assignment looks organic, not scan-line */
    for (var s = pts.length - 1; s > 0; s--) {
      var t = (Math.random() * (s + 1)) | 0, tmp = pts[s];
      pts[s] = pts[t]; pts[t] = tmp;
    }
    return pts;
  }

  function assignTargets() {
    if (!stageEl) return;
    var rect = stageEl.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 40) return;

    stageBaseTop = rect.top;
    stageShift = 0;

    var cap = W < 620 ? 240 : 460;
    targets = sampleText(rect, cap);
    if (!targets.length) return;

    /* make sure we have at least one particle per point */
    while (parts.length < targets.length) {
      var np = spawn(true);
      np.a = 0;
      parts.push(np);
    }

    /* nearest-ish assignment: sort particles by distance to the cloud centre */
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    parts.sort(function (a, b) {
      var da = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy);
      var db = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
      return da - db;
    });

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (i < targets.length) {
        p.has = true;
        p.tx = targets[i].x;
        p.ty = targets[i].y;
        /* letters need to read clearly, so lift the ceiling on brightness */
        p.aMax = 0.72 + Math.random() * 0.28;
        p.ease = 0.028 + Math.random() * 0.05;
        p.jr = 0.6 + Math.random() * 1.1;
        p.jp = Math.random() * TAU;
        if (p.k === 2) { p.k = Math.random() < 0.5 ? 0 : 1; p.r = 2.2 + Math.random() * 2.6; }
      } else {
        p.has = false;
      }
    }
  }

  /* ---------- loop ---------- */
  function step(now) {
    rafId = requestAnimationFrame(step);
    if (!lastT) lastT = now;
    var dt = Math.min((now - lastT) / 16.6667, 3.2);
    lastT = now;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    var elapsed = now - phaseStart;

    /* follow the finale stage while the page scrolls */
    if (stageEl && phase !== 'free' && phase !== 'done') {
      if (++rectTick % 2 === 0) {
        stageShift = stageEl.getBoundingClientRect().top - stageBaseTop;
      }
    }

    if (phase === 'gather' && elapsed > GATHER_MS) {
      phase = 'glow'; phaseStart = now;
      document.body.classList.add('finale-glow-on');
    } else if (phase === 'glow' && elapsed > GLOW_MS) {
      phase = 'ascend'; phaseStart = now;
      for (var q = 0; q < parts.length; q++) {
        parts[q].vy = -(0.22 + Math.random() * 0.62);
        parts[q].vx = (Math.random() - 0.5) * 0.22;
      }
    } else if (phase === 'ascend' && elapsed > ASCEND_MS) {
      phase = 'done'; phaseStart = now;
    }

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];

      p.tw += p.tws * dt * 16.6667;
      p.sw += p.sws * dt * 16.6667;

      if (phase === 'free') {
        p.x += p.vx * dt + Math.cos(p.sw) * p.swr * 0.0026 * dt;
        p.y += p.vy * dt;
        if (p.y < -40) { p.y = H + 20; p.x = Math.random() * W; }
        if (p.x < -40) p.x = W + 20;
        if (p.x > W + 40) p.x = -20;
        if (p.a < p.aMax) p.a = Math.min(p.aMax, p.a + 0.012 * dt);

      } else if (phase === 'gather') {
        if (p.has) {
          var gx = p.tx, gy = p.ty + stageShift;
          p.x += (gx - p.x) * p.ease * dt;
          p.y += (gy - p.y) * p.ease * dt;
          if (p.a < p.aMax) p.a = Math.min(p.aMax, p.a + 0.02 * dt);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.a = Math.max(0, p.a - 0.016 * dt);
        }

      } else if (phase === 'glow') {
        if (p.has) {
          var jx = p.tx + Math.cos(p.tw * 1.7 + p.jp) * p.jr;
          var jy = p.ty + stageShift + Math.sin(p.tw * 1.4 + p.jp) * p.jr;
          p.x += (jx - p.x) * 0.16 * dt;
          p.y += (jy - p.y) * 0.16 * dt;
          p.a = Math.min(1, p.a + 0.012 * dt);
        } else {
          p.a = Math.max(0, p.a - 0.03 * dt);
        }

      } else {                                   /* ascend + done */
        p.x += p.vx * dt + Math.cos(p.sw * 2.1) * 0.16 * dt;
        p.y += p.vy * dt;
        p.a = Math.max(0, p.a - 0.0055 * dt);
      }

      if (p.a <= 0.004) continue;

      var tw = p.k === 1 ? (0.62 + 0.38 * Math.sin(p.tw)) : (0.78 + 0.22 * Math.sin(p.tw));
      var alpha = p.a * tw;
      var rad = p.r;
      if (phase === 'glow' && p.has) rad = p.r * (1.35 + 0.25 * Math.sin(p.tw * 2));

      ctx.globalAlpha = alpha > 1 ? 1 : alpha;
      ctx.drawImage(sprites[p.k], p.x - rad, p.y - rad, rad * 2, rad * 2);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- controls ---------- */
  function start() {
    if (running || reduceMotion.matches || !sprites.length) return;
    running = true; lastT = 0;
    rafId = requestAnimationFrame(step);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var wasFinale = (phase === 'gather' || phase === 'glow');
      resize();
      if (phase === 'free') build();
      if (wasFinale) assignTargets();
    }, 220);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  /* public API */
  window.KeralaParticles = {
    init: function () {
      if (reduceMotion.matches) return;
      sprites = [makeSprite(0), makeSprite(1), makeSprite(2)];
      resize();
      build();
      start();
      requestAnimationFrame(function () { canvas.classList.add('on'); });
    },
    finale: function (el) {
      if (reduceMotion.matches || !el || armed) return;
      if (phase !== 'free') return;
      armed = true;
      stageEl = el;
      var go = function () {
        assignTargets();
        if (!targets.length) { armed = false; return; }
        phase = 'gather';
        phaseStart = performance.now();
        document.body.classList.add('finale-particles');
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go).catch(go);
      else go();
    },
    reset: function () {
      armed = false;
      if (phase === 'free') return;
      phase = 'free';
      phaseStart = performance.now();
      stageShift = 0;
      targets.length = 0;
      document.body.classList.remove('finale-particles', 'finale-glow-on');
      build();
    },
    isReduced: function () { return reduceMotion.matches; }
  };
})();

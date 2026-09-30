/* Звук: синтез через WebAudio, без файлов. */
(function (root) {
  'use strict';
  var ctx = null, enabled = true, master = null, last = {};
  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination); } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function beep(freq, dur, type, vol, when, slideTo) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function throttle(k, ms) { var n = Date.now(); if (last[k] && n - last[k] < ms) return false; last[k] = n; return true; }
  var N = { c: 523.25, d: 587.33, e: 659.25, g: 783.99, a: 880, c2: 1046.5, e2: 1318.5, g2: 1568 };
  var API = {
    setEnabled: function (v) { enabled = !!v; },
    unlock: function () { ensure(); },
    tap: function (combo) { if (!throttle('tap', 40)) return; beep(520 + Math.min(combo || 0, 12) * 38, 0.09, 'triangle', 0.35, 0, 760 + Math.min(combo || 0, 12) * 40); },
    buy: function () { beep(N.e, 0.09, 'square', 0.16); beep(N.a, 0.12, 'square', 0.16, 0.07); },
    upgrade: function () { beep(N.c, 0.1, 'triangle', 0.3); beep(N.e, 0.1, 'triangle', 0.3, 0.08); beep(N.g, 0.16, 'triangle', 0.3, 0.16); },
    error: function () { if (throttle('err', 200)) beep(160, 0.15, 'sawtooth', 0.18, 0, 110); },
    star: function () { beep(N.g2, 0.3, 'sine', 0.25); beep(N.e2, 0.4, 'sine', 0.2, 0.1); },
    catchStar: function () { [N.c, N.e, N.g, N.c2, N.e2].forEach(function (f, i) { beep(f, 0.18, 'triangle', 0.3, i * 0.06); }); },
    achieve: function () { [N.g, N.c2, N.e2, N.g2].forEach(function (f, i) { beep(f, 0.22, 'sine', 0.3, i * 0.09); }); },
    zone: function () { [N.c, N.g, N.c2, N.e2, N.g2].forEach(function (f, i) { beep(f, 0.4, 'sine', 0.28, i * 0.12); }); },
    prestige: function () { beep(200, 0.9, 'sine', 0.4, 0, 60); [N.c, N.e, N.g, N.c2].forEach(function (f, i) { beep(f, 0.5, 'triangle', 0.22, 0.4 + i * 0.12); }); },
    ascend: function () { beep(120, 1.6, 'sawtooth', 0.15, 0, 900); [N.c, N.g, N.c2, N.e2, N.g2, N.g2 * 1.25].forEach(function (f, i) { beep(f, 0.7, 'sine', 0.25, 0.6 + i * 0.14); }); },
    click: function () { if (throttle('clk', 60)) beep(700, 0.04, 'square', 0.1); }
  };
  root.MayakAudio = API;
})(typeof self !== 'undefined' ? self : this);

/* Сцена на canvas: небо, море, маяк, луч, частицы. Всё нарисовано кодом (оригинальная графика). */
(function (root) {
  'use strict';
  var cv, g, W = 0, H = 0, dpr = 1, zone = null, zoneIdx = 0, t = 0, particles = [], stars = [], clouds = [], boats = [];
  var intensity = 0.3, particlesOn = true, pulse = 0, rain = [], lightning = 0, running = false, lastTs = 0, transition = 1, prevZone = null, hidden = false;
  var rng = (function () { var a = 12345; return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();

  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  function mix(a, b, k) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')'; }

  function init(canvas) {
    cv = canvas; g = cv.getContext('2d');
    for (var i = 0; i < 90; i++) stars.push({ x: rng(), y: rng() * 0.6, r: 0.4 + rng() * 1.3, p: rng() * 6.28, s: 0.5 + rng() * 2 });
    for (i = 0; i < 6; i++) clouds.push({ x: rng(), y: 0.1 + rng() * 0.35, s: 0.6 + rng() * 0.9, v: 0.004 + rng() * 0.01 });
    for (i = 0; i < 3; i++) boats.push({ x: rng(), y: 0.74 + i * 0.05, v: 0.006 + rng() * 0.006, s: 0.7 + rng() * 0.5 });
    resize();
    root.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () { hidden = document.hidden; if (!hidden) { lastTs = 0; } });
  }
  function resize() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function setZone(z, zi, instant) {
    if (zoneIdx === zi && zone) return;
    prevZone = zone; zone = z; zoneIdx = zi; transition = instant || !prevZone ? 1 : 0;
  }
  function setIntensity(v) { intensity = Math.max(0.1, Math.min(1, v)); }
  function setParticles(v) { particlesOn = !!v; if (!v) particles.length = 0; }
  function pulseNow(k) { pulse = Math.min(1.5, pulse + (k || 0.6)); }

  function burst(x, y, n, color, spread, up) {
    if (!particlesOn) return;
    if (particles.length > 260) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = (spread || 90) * (0.3 + Math.random());
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (up || 40), life: 0.6 + Math.random() * 0.7, age: 0, r: 1.5 + Math.random() * 2.6, c: color || '#ffe9a0' });
    }
  }
  function lighthousePos() { return { x: W * 0.5, y: H * 0.78 }; }
  function lanternPos() { var p = lighthousePos(), th = H * 0.5; return { x: p.x, y: p.y - th }; }

  function drawSky(z, alpha) {
    var top = hex(z.sky[0]), bot = hex(z.sky[1]);
    var gr = g.createLinearGradient(0, 0, 0, H * 0.8);
    gr.addColorStop(0, mix(top, top, 0)); gr.addColorStop(1, mix(bot, bot, 0));
    g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var night = zoneIdx !== 3 ? 1 : 0.15;
    if (z.id !== 'sky') {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i]; var tw = 0.5 + 0.5 * Math.sin(t * s.s + s.p);
        var count = z.id === 'stars' || z.id === 'edge' ? 90 : z.id === 'moon' ? 70 : z.id === 'storm' ? 12 : 40;
        if (i >= count) break;
        g.globalAlpha = alpha * night * (0.25 + 0.6 * tw);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, 6.283); g.fill();
      }
    }
    g.globalAlpha = alpha;
    if (z.id === 'moon' || z.id === 'harbor' || z.id === 'shore') { // луна
      var mx = W * 0.8, my = H * 0.18, mr = z.id === 'moon' ? H * 0.11 : H * 0.055;
      var rg = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
      rg.addColorStop(0, 'rgba(255,248,210,0.35)'); rg.addColorStop(1, 'rgba(255,248,210,0)');
      g.fillStyle = rg; g.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
      g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(mx, my, mr, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(200,190,150,0.35)'; g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, 6.283); g.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.15, 0, 6.283); g.fill();
    }
    if (z.id === 'stars' || z.id === 'edge') { // туманность
      var ng = g.createRadialGradient(W * 0.25, H * 0.25, 5, W * 0.25, H * 0.25, W * 0.5);
      ng.addColorStop(0, z.id === 'edge' ? 'rgba(255,120,220,0.28)' : 'rgba(120,120,255,0.22)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(0, 0, W, H);
      // падающая звезда
      var ph = (t * 0.25) % 6; if (ph < 0.6) { var k = ph / 0.6; g.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; g.lineWidth = 1.5; g.beginPath(); var sx = W * (0.9 - k * 0.5), sy = H * (0.05 + k * 0.3); g.moveTo(sx, sy); g.lineTo(sx + 26, sy - 12); g.stroke(); }
    }
    if (z.id === 'edge') { // рассвет на горизонте
      var eg = g.createLinearGradient(0, H * 0.55, 0, H * 0.8); eg.addColorStop(0, 'rgba(255,150,80,0)'); eg.addColorStop(1, 'rgba(255,170,90,' + (0.45 + 0.1 * Math.sin(t)) + ')');
      g.fillStyle = eg; g.fillRect(0, H * 0.55, W, H * 0.25);
    }
    if (z.id === 'sky' || z.id === 'harbor' || z.id === 'storm') {
      var dark = z.id === 'storm';
      for (i = 0; i < clouds.length; i++) {
        var c = clouds[i], cx = ((c.x + t * c.v) % 1.3 - 0.15) * W, cy = c.y * H, cs = c.s * W * 0.12;
        g.fillStyle = dark ? 'rgba(30,34,55,0.85)' : z.id === 'sky' ? 'rgba(255,255,255,0.85)' : 'rgba(180,190,220,0.25)';
        g.beginPath(); g.arc(cx, cy, cs * 0.6, 0, 6.283); g.arc(cx + cs * 0.6, cy + 3, cs * 0.5, 0, 6.283); g.arc(cx - cs * 0.6, cy + 4, cs * 0.45, 0, 6.283); g.arc(cx + cs * 0.15, cy - cs * 0.3, cs * 0.5, 0, 6.283); g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  function drawSea(z) {
    var sea = hex(z.sea), y0 = H * 0.78;
    var gr = g.createLinearGradient(0, y0 - 6, 0, H);
    gr.addColorStop(0, mix(sea, [255, 255, 255], 0.18)); gr.addColorStop(1, mix(sea, [0, 0, 0], 0.55));
    g.fillStyle = gr; g.fillRect(0, y0 - 4, W, H - y0 + 4);
    var amp = z.id === 'storm' ? 7 : 3.5;
    for (var l = 0; l < 4; l++) {
      g.beginPath(); g.moveTo(0, H);
      for (var x = 0; x <= W; x += 8) g.lineTo(x, y0 + l * 9 + Math.sin(x * 0.03 + t * (1.2 + l * 0.3) + l) * amp * (1 + l * 0.3));
      g.lineTo(W, H); g.closePath();
      g.fillStyle = 'rgba(' + (l % 2 ? '255,255,255' : '0,0,20') + ',' + (0.06 + l * 0.02) + ')'; g.fill();
    }
    // блики луча на воде
    var L = lanternPos(), rg = g.createRadialGradient(L.x, y0 + 8, 2, L.x, y0 + 8, W * 0.45);
    rg.addColorStop(0, 'rgba(255,230,150,' + (0.18 + intensity * 0.3) + ')'); rg.addColorStop(1, 'rgba(255,230,150,0)');
    g.fillStyle = rg; g.fillRect(0, y0, W, H - y0);
    if (z.id === 'harbor' || z.id === 'shore') { // лодки
      for (var i = 0; i < boats.length; i++) {
        var b = boats[i], bx = ((b.x + t * b.v) % 1.2 - 0.1) * W, by = H * b.y + Math.sin(t * 1.5 + i) * 2, s = 10 * b.s;
        g.fillStyle = '#3a2a22'; g.beginPath(); g.moveTo(bx - s, by); g.lineTo(bx + s, by); g.lineTo(bx + s * 0.6, by + s * 0.5); g.lineTo(bx - s * 0.6, by + s * 0.5); g.closePath(); g.fill();
        g.strokeStyle = '#ddd'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - s * 1.6); g.stroke();
        g.fillStyle = '#f4ecd8'; g.beginPath(); g.moveTo(bx + 1, by - s * 1.6); g.lineTo(bx + s * 0.9, by - s * 0.2); g.lineTo(bx + 1, by - s * 0.2); g.fill();
        g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(bx - s * 0.6, by - 2, 1.6, 0, 6.283); g.fill();
      }
    }
  }
  function drawIsland() {
    var p = lighthousePos(), w = W * 0.5;
    g.fillStyle = '#2a2f3d'; g.beginPath(); g.moveTo(p.x - w * 0.6, H); g.quadraticCurveTo(p.x - w * 0.35, p.y - 4, p.x - w * 0.12, p.y + 2); g.lineTo(p.x + w * 0.14, p.y + 2); g.quadraticCurveTo(p.x + w * 0.4, p.y - 6, p.x + w * 0.62, H); g.closePath(); g.fill();
    g.fillStyle = '#3a4152'; g.beginPath(); g.moveTo(p.x - w * 0.3, H); g.quadraticCurveTo(p.x - w * 0.2, p.y + 6, p.x - w * 0.02, p.y + 5); g.lineTo(p.x + w * 0.1, H); g.closePath(); g.fill();
  }
  function drawLighthouse() {
    var p = lighthousePos(), th = H * 0.5, bw = Math.min(W * 0.16, 62), tw = bw * 0.62, top = p.y - th;
    // тело
    g.save();
    g.beginPath(); g.moveTo(p.x - bw / 2, p.y); g.lineTo(p.x - tw / 2, top + 22); g.lineTo(p.x + tw / 2, top + 22); g.lineTo(p.x + bw / 2, p.y); g.closePath(); g.clip();
    g.fillStyle = '#f2efe6'; g.fillRect(p.x - bw, top, bw * 2, th);
    var stripes = 5;
    for (var i = 0; i < stripes; i++) { if (i % 2 === 0) { g.fillStyle = '#c8433c'; g.fillRect(p.x - bw, top + 22 + (th - 22) * (i + 0.5) / stripes, bw * 2, (th - 22) / stripes); } }
    var sh = g.createLinearGradient(p.x - bw / 2, 0, p.x + bw / 2, 0); sh.addColorStop(0, 'rgba(0,0,0,0.25)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(0,0,20,0.4)');
    g.fillStyle = sh; g.fillRect(p.x - bw, top, bw * 2, th);
    g.restore();
    // окошки
    g.fillStyle = '#ffd77a';
    for (i = 1; i < 4; i++) { var wy = top + 22 + (th - 22) * i / 4.4; g.fillRect(p.x - 3, wy, 6, 9); }
    // галерея
    g.fillStyle = '#222836'; g.fillRect(p.x - tw * 0.85, top + 16, tw * 1.7, 7);
    g.strokeStyle = '#222836'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x - tw * 0.85, top + 16); g.lineTo(p.x - tw * 0.85, top + 8); g.moveTo(p.x + tw * 0.85, top + 16); g.lineTo(p.x + tw * 0.85, top + 8); g.moveTo(p.x - tw * 0.85, top + 9); g.lineTo(p.x + tw * 0.85, top + 9); g.stroke();
    // фонарная
    var lw = tw * 0.8, lh = 16;
    var glow = 0.5 + intensity * 0.5 + pulse * 0.3;
    var rg = g.createRadialGradient(p.x, top + 6, 2, p.x, top + 6, 30 + 70 * intensity + 30 * pulse);
    rg.addColorStop(0, 'rgba(255,240,170,' + Math.min(1, glow) + ')'); rg.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = rg; g.fillRect(p.x - 140, top - 130, 280, 270);
    g.fillStyle = 'rgba(255,236,150,' + Math.min(1, 0.7 + pulse * 0.3) + ')'; g.fillRect(p.x - lw / 2, top, lw, lh);
    g.strokeStyle = '#222836'; g.lineWidth = 1.5; g.strokeRect(p.x - lw / 2, top, lw, lh); g.beginPath(); g.moveTo(p.x, top); g.lineTo(p.x, top + lh); g.stroke();
    g.fillStyle = '#c8433c'; g.beginPath(); g.moveTo(p.x - lw / 2 - 3, top); g.lineTo(p.x, top - 14); g.lineTo(p.x + lw / 2 + 3, top); g.closePath(); g.fill();
    g.fillStyle = '#222836'; g.beginPath(); g.arc(p.x, top - 16, 2.5, 0, 6.283); g.fill();
    // луч
    var ang = t * 0.9, cs = Math.cos(ang), beamLen = W * 1.2;
    var side = cs; // «вращение»: ширина луча зависит от косинуса
    var lx = p.x, ly = top + 8, len = beamLen * Math.abs(cs), dir = cs >= 0 ? 1 : -1;
    var bright = 0.12 + intensity * 0.28 + pulse * 0.15;
    var bg = g.createLinearGradient(lx, ly, lx + dir * len, ly);
    bg.addColorStop(0, 'rgba(255,240,170,' + bright * 1.6 + ')'); bg.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = bg; g.beginPath(); g.moveTo(lx, ly - 2); g.lineTo(lx + dir * len, ly - 14 - 26 * Math.abs(cs)); g.lineTo(lx + dir * len, ly + 14 + 26 * Math.abs(cs)); g.lineTo(lx, ly + 2); g.closePath(); g.fill();
  }
  function drawWeather(z, dt) {
    if (z.id === 'storm') {
      g.strokeStyle = 'rgba(180,200,255,0.35)'; g.lineWidth = 1; g.beginPath();
      while (rain.length < 70) rain.push({ x: rng() * 1.2, y: rng(), v: 0.9 + rng() * 0.6 });
      for (var i = 0; i < rain.length; i++) { var r = rain[i]; r.y += r.v * dt; r.x -= 0.25 * dt; if (r.y > 1) { r.y = 0; r.x = rng() * 1.2; } g.moveTo(r.x * W, r.y * H * 0.85); g.lineTo(r.x * W - 4, r.y * H * 0.85 + 11); }
      g.stroke();
      if (lightning <= 0 && Math.random() < dt * 0.15) lightning = 0.35;
      if (lightning > 0) { g.fillStyle = 'rgba(220,230,255,' + Math.min(0.5, lightning * 1.6) + ')'; g.fillRect(0, 0, W, H); lightning -= dt; }
    }
  }
  function drawParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      var a = 1 - p.age / p.life; g.globalAlpha = a; g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
  }
  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (hidden || !g || !zone) return;
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016; lastTs = ts; t += dt;
    if (transition < 1) transition = Math.min(1, transition + dt * 0.8);
    pulse = Math.max(0, pulse - dt * 2.2);
    g.clearRect(0, 0, W, H);
    if (prevZone && transition < 1) { drawSky(prevZone, 1); drawSky(zone, transition); } else drawSky(zone, 1);
    drawSea(zone); drawIsland(); drawLighthouse(); drawWeather(zone, dt); drawParticles(dt);
  }
  function start() { if (running) return; running = true; requestAnimationFrame(frame); }
  function size() { return { w: W, h: H }; }

  root.MayakScene = { init: init, start: start, setZone: setZone, setIntensity: setIntensity, setParticles: setParticles, burst: burst, pulse: pulseNow, lanternPos: lanternPos, size: size, resize: resize };
})(typeof self !== 'undefined' ? self : this);

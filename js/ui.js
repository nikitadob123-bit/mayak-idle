/* Интерфейс. Списки строятся один раз и обновляются «на месте», чтобы касания не терялись. */
(function (root) {
  'use strict';
  var U = root.MayakUtil, D = root.MayakData, E = root.MayakEngine, A = root.MayakAudio, Sc = root.MayakScene;
  var fmt = U.fmt, $ = function (id) { return document.getElementById(id); };
  var G = null; // игра: {s, save(), ...}
  var els = {}, rows = { gen: [], upg: {}, shop: {}, perk: {}, ach: {} }, upgFilter = 'avail', floaters = 0, comboT = [], curTab = 'gens';

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
  function setCls(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }

  /* ---------- тосты и модальные окна ---------- */
  function toast(html, opts) {
    opts = opts || {};
    var t = h('div', 'toast' + (opts.persist ? ' persist' : ''), html);
    var box = $('toasts');
    while (box.children.length > 3) box.removeChild(box.firstChild);
    box.appendChild(t);
    if (!opts.persist) setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3700);
    return t;
  }
  var modalQ = [], modalOpen = false;
  function modal(o) { modalQ.push(o); if (!modalOpen) nextModal(); }
  function nextModal() {
    var o = modalQ.shift(); if (!o) { modalOpen = false; return; }
    modalOpen = true;
    var ov = h('div', 'ov'), m = h('div', 'modal');
    m.innerHTML = (o.emoji ? '<span class="em">' + o.emoji + '</span>' : '') + '<h2>' + o.title + '</h2>' + (o.body || '');
    var btns = h('div', 'row2');
    (o.buttons || [{ text: 'Отлично!', cls: 'gold' }]).forEach(function (b) {
      var bt = h('button', 'btn ' + (b.cls || ''), b.text);
      if (b.id) bt.id = b.id;
      bt.addEventListener('click', function () {
        if (b.keep) { b.onClick && b.onClick(m, bt); return; }
        close(); A.click(); b.onClick && b.onClick(m);
      });
      btns.appendChild(bt);
    });
    m.appendChild(btns); ov.appendChild(m); $('modalRoot').appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); modalOpen = false; setTimeout(nextModal, 60); }
    if (o.onOpen) o.onOpen(m);
    ov.addEventListener('click', function (e) { if (e.target === ov && o.dismiss !== false) close(); });
  }

  /* ---------- всплывающие числа ---------- */
  function floatText(x, y, text, big) {
    if (floaters > 30) return;
    var f = h('div', 'float' + (big ? ' big' : ''), text);
    f.style.left = x + 'px'; f.style.top = y + 'px'; floaters++;
    els.floaters.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); floaters--; }, big ? 1700 : 1200);
  }

  /* ---------- сборка списков ---------- */
  function buildGens() {
    var box = $('genList'); box.innerHTML = '';
    D.GENS.forEach(function (g, i) {
      var r = h('div', 'row'), c = {};
      r.innerHTML = '<div class="ico">' + g.emoji + '</div><div class="mid"><div class="nm"><span>' + g.name + '</span><span class="cnt"></span></div><div class="ds"></div><div class="mbar"><i></i></div></div><button class="buy"><b></b><small></small></button>';
      c.row = r; c.cnt = r.querySelector('.cnt'); c.ds = r.querySelector('.ds'); c.bar = r.querySelector('.mbar i'); c.btn = r.querySelector('.buy'); c.b = c.btn.querySelector('b'); c.sm = c.btn.querySelector('small');
      c.btn.addEventListener('click', function () { G.buyGen(i, c); });
      rows.gen.push(c); box.appendChild(r);
    });
    els.genLock = h('div', 'row locked'); els.genLock.innerHTML = '<div class="ico">🔒</div><div class="mid"><div class="nm"></div><div class="ds"></div></div>';
    box.appendChild(els.genLock);
  }
  function buildUpgrades() {
    var box = $('upgList'); box.innerHTML = '';
    var list = D.UPGRADES.slice().sort(function (a, b) { return a.cost - b.cost; });
    list.forEach(function (u) {
      var r = h('div', 'row'), c = { u: u };
      r.innerHTML = '<div class="ico">' + u.emoji + '</div><div class="mid"><div class="nm">' + u.name + '</div><div class="ds">' + u.desc + '</div><div class="ds req"></div></div><button class="buy"><b></b><small></small></button>';
      c.row = r; c.req = r.querySelector('.req'); c.btn = r.querySelector('.buy'); c.b = c.btn.querySelector('b'); c.sm = c.btn.querySelector('small');
      c.btn.addEventListener('click', function () { G.buyUpgrade(u.id, c); });
      rows.upg[u.id] = c; box.appendChild(r);
    });
    els.upgNote = h('div', 'ds'); els.upgNote.style.cssText = 'text-align:center;padding:8px;color:var(--dim);font-size:12px';
    box.appendChild(els.upgNote);
    var f = $('upgFilter'); f.innerHTML = '';
    var chips = [['avail', '✅ Доступные'], ['all', 'Все']].concat(D.BRANCHES.map(function (b) { return [b.id, b.emoji + ' ' + b.name]; })).concat([['owned', '✔ Куплено']]);
    chips.forEach(function (ch) {
      var b = h('button', ch[0] === upgFilter ? 'on' : '', ch[1]); b.dataset.f = ch[0];
      b.addEventListener('click', function () { upgFilter = ch[0]; A.click(); Array.prototype.forEach.call(f.children, function (x) { setCls(x, 'on', x.dataset.f === upgFilter); }); updateUpgrades(true); });
      f.appendChild(b);
    });
  }
  function reqText(s, u) {
    var out = [];
    u.req.forEach(function (id) { if (!s.upgrades[id]) out.push('«' + D.UPG[id].name + '»'); });
    if (u.cond && s.gens[u.cond.gen] < u.cond.n) out.push(u.cond.n + ' × ' + D.GENS[u.cond.gen].name.toLowerCase() + ' (' + s.gens[u.cond.gen] + ')');
    return out.length ? '🔒 Нужно: ' + out.join(', ') : '';
  }

  function buildPrestige() {
    var t = $('tab-pres');
    t.innerHTML =
      '<div class="card"><h3>🌊 Отлив</h3><p>Сбрось забег (свет, огни, улучшения), чтобы получить <b>🦪 жемчужины</b>. Каждая жемчужина навсегда усиливает выработку.</p>' +
      '<div class="kv"><span>Жемчужин за этот забег</span><span class="big" id="pr-gain" style="font-size:20px;color:var(--gold)">0</span></div>' +
      '<div class="kv"><span>Множитель сейчас → после</span><span id="pr-mult"></span></div>' +
      '<div class="kv"><span>Следующая жемчужина при</span><span id="pr-next"></span></div>' +
      '<div class="progress"><i id="pr-bar" style="width:0"></i></div>' +
      '<button class="btn gold" id="pr-btn">Сделать отлив</button></div>' +
      '<h2 class="sec">🎁 Дары глубин <span style="font-weight:400;text-transform:none">(🦪 <b id="pr-have">0</b> · сбрасываются вознесением)</span></h2><div id="shopList"></div>' +
      '<h2 class="sec">🌠 Вознесение</h2>' +
      '<div class="card" id="asc-card"><p>Второй, глубокий слой. Вознесение сбрасывает <b>всё</b>: жемчужины, дары глубин и забег. Взамен даёт <b>⭐ звёзды</b>: они навсегда усиливают выработку и открывают <b>созвездия</b>. Открывает зону «Край мироздания».</p>' +
      '<div class="kv"><span>Звёзд за вознесение</span><span class="big" id="asc-gain" style="font-size:20px;color:#c9a9ff">0</span></div>' +
      '<div class="kv"><span>Жемчужин за цикл</span><span id="asc-cycle"></span></div>' +
      '<div class="kv"><span>Множитель звёзд сейчас → после</span><span id="asc-mult"></span></div>' +
      '<div class="progress"><i id="asc-bar" style="width:0"></i></div>' +
      '<button class="btn purple" id="asc-btn">Вознестись</button></div>' +
      '<h2 class="sec">✨ Созвездия <span style="font-weight:400;text-transform:none">(⭐ <b id="asc-have">0</b> · навсегда)</span></h2><div id="perkList"></div>';
    var sl = $('shopList');
    D.SHOP.forEach(function (it) {
      var r = h('div', 'row'), c = { it: it };
      r.innerHTML = '<div class="ico">' + it.emoji + '</div><div class="mid"><div class="nm">' + it.name + '</div><div class="ds">' + it.desc + '</div></div><button class="buy"><b></b><small></small></button>';
      c.row = r; c.btn = r.querySelector('.buy'); c.b = c.btn.querySelector('b'); c.sm = c.btn.querySelector('small');
      c.btn.addEventListener('click', function () { G.buyShop(it.id); });
      rows.shop[it.id] = c; sl.appendChild(r);
    });
    var pl = $('perkList');
    D.PERKS.forEach(function (it) {
      var r = h('div', 'row'), c = { it: it };
      r.innerHTML = '<div class="ico">' + it.emoji + '</div><div class="mid"><div class="nm">' + it.name + '</div><div class="ds">' + it.desc + '</div></div><button class="buy"><b></b><small></small></button>';
      c.row = r; c.btn = r.querySelector('.buy'); c.b = c.btn.querySelector('b'); c.sm = c.btn.querySelector('small');
      c.btn.addEventListener('click', function () { G.buyPerk(it.id); });
      rows.perk[it.id] = c; pl.appendChild(r);
    });
    $('pr-btn').addEventListener('click', function () { G.askPrestige(); });
    $('asc-btn').addEventListener('click', function () { G.askAscend(); });
  }

  function buildRewards() {
    var t = $('tab-rew');
    t.innerHTML = '<div class="card" id="dailyCard"><h3>📅 Ежедневная награда</h3><div class="days" id="dailyDays"></div><p id="dailyText"></p><button class="btn gold" id="dailyBtn">Забрать</button></div>' +
      '<h2 class="sec">🏆 Достижения <span style="font-weight:400;text-transform:none" id="achCount"></span></h2><div class="grid" id="achGrid"></div>';
    var gr = $('achGrid');
    D.ACHIEVEMENTS.forEach(function (a) {
      var e = h('div', 'ach', '<div class="e">' + a.emoji + '</div><div><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small><small style="color:var(--gold)">+' + a.b + '% к выработке</small></div>');
      rows.ach[a.id] = e; gr.appendChild(e);
    });
    $('dailyBtn').addEventListener('click', function () { G.claimDaily(); });
  }

  function buildMore() {
    var t = $('tab-more');
    t.innerHTML =
      '<h2 class="sec" style="margin-top:4px">📊 Статистика</h2><div class="card" id="statsCard"></div>' +
      '<h2 class="sec">⚙️ Настройки</h2><div class="card">' +
      '<div class="sw"><span>🔊 Звук</span><button class="tog" id="set-sound" aria-label="Звук"></button></div>' +
      '<div class="sw"><span>✨ Частицы</span><button class="tog" id="set-part" aria-label="Частицы"></button></div>' +
      '<div class="sw"><span>🎨 Тема</span><span id="themeBtns"></span></div></div>' +
      '<h2 class="sec">💾 Данные</h2><div class="card"><p>Игра сохраняется автоматически. Код сохранения можно перенести на другое устройство.</p>' +
      '<button class="btn ghost" id="btn-export">📤 Экспорт (показать код)</button>' +
      '<button class="btn ghost" id="btn-import">📥 Импорт из кода</button>' +
      '<button class="btn red" id="btn-reset">🗑️ Полный сброс</button></div>' +
      '<h2 class="sec">ℹ️ О игре</h2><div class="card"><p><b>Хозяин маяка</b> · версия <span id="verTxt"></span></p><p>Работает офлайн, ничего не отправляет в сеть. Вся графика и звук — созданы кодом.</p><button class="btn ghost" id="btn-update">🔄 Проверить обновление</button></div>';
    var tb = $('themeBtns');
    [['night', '🌙 Ночь'], ['dawn', '🌅 Рассвет'], ['dark', '⚫ Тёмная']].forEach(function (x) {
      var b = h('button', 'btn sm ghost', x[1]); b.dataset.th = x[0]; b.addEventListener('click', function () { G.setTheme(x[0]); }); tb.appendChild(b);
    });
    $('set-sound').addEventListener('click', function () { G.toggle('sound'); });
    $('set-part').addEventListener('click', function () { G.toggle('particles'); });
    $('btn-export').addEventListener('click', function () { G.showExport(); });
    $('btn-import').addEventListener('click', function () { G.showImport(); });
    $('btn-reset').addEventListener('click', function () { G.askReset(); });
    $('btn-update').addEventListener('click', function () { G.checkUpdate(true); });
    $('verTxt').textContent = D.APP_VERSION + ' (сохранение v' + D.SAVE_VERSION + ')';
  }

  /* ---------- обновление отображения ---------- */
  function updateTop(s) {
    var c = E.calc(s), p = E.prod(s);
    setText(els.light, fmt(s.light)); setText(els.rate, fmt(p, true));
    setText(els.zoneName, D.ZONES[s.zone].emoji + ' ' + D.ZONES[s.zone].name);
    els.pearlPill.hidden = !(s.pearlsAll > 0); els.starPill.hidden = !(s.starsAll > 0);
    setText(els.pearlsN, fmt(s.pearls)); setText(els.starsN, fmt(s.stars));
    var bm = E.buffMult(s); var tag = els.buffTag;
    if (bm > 1 || s.buffs.tapfrenzy > 0) { tag.hidden = false; setText(tag, (bm > 1 ? '×' + (Math.round(bm * 10) / 10) : '') + (s.buffs.tapfrenzy > 0 ? ' 👆×' + E.TAPFRENZY : '')); } else tag.hidden = true;
    Sc.setIntensity(Math.log10(p + 1) / 22 + 0.15);
    // прогресс зоны
    var nx = E.zoneNext(s), bar = els.zoneBar, tx = els.zoneText;
    if (nx == null) { bar.style.width = '100%'; setText(tx, 'Все зоны открыты'); }
    else {
      var z = D.ZONES[nx];
      if (z.needAscend && s.ascensions < z.needAscend && s.runLight >= z.need) { bar.style.width = '100%'; setText(tx, '🌠 «' + z.name + '»: нужно Вознесение'); }
      else {
        var lo = Math.log10(Math.max(D.ZONES[s.zone].need, 1)), hi = Math.log10(z.need), cur = Math.log10(Math.max(s.runLight, 1));
        var pct = Math.max(0, Math.min(1, (cur - lo) / (hi - lo)));
        bar.style.width = (pct * 100).toFixed(1) + '%'; setText(tx, 'До «' + z.name + '»: ' + fmt(s.runLight) + ' / ' + fmt(z.need));
      }
    }
  }
  function updateBuffs(s) {
    var box = els.buffs, names = { frenzy: ['⭐ Безумие ×7', 30], tapfrenzy: ['👆 Золотые пальцы ×20', 20], wind: ['🌬️ Попутный ветер ×1.5', 60], whale: ['🐋 Кит-светоносец ×77', 10] };
    var keys = Object.keys(s.buffs).sort(), sig = keys.join(',');
    if (box._sig !== sig) { box._sig = sig; box.innerHTML = ''; keys.forEach(function (k) { var d = h('div', 'buff', names[k][0] + ' <span></span><i></i>'); d.dataset.k = k; box.appendChild(d); }); }
    Array.prototype.forEach.call(box.children, function (d) {
      var k = d.dataset.k, left = s.buffs[k] || 0; d.querySelector('span').textContent = Math.ceil(left) + 'с';
      d.querySelector('i').style.width = Math.min(100, left / (E.EV_DUR[k] * E.calc(s).evdur) * 100) + '%';
    });
  }
  function updateStar(s) {
    var b = els.starBtn;
    if (!s.star) { b.hidden = true; return; }
    if (b.hidden) { b.hidden = false; b.textContent = s.star.kind === 'whale' ? '🐋' : '⭐'; setCls(b, 'whale', s.star.kind === 'whale'); var sz = Sc.size(); b.style.left = (s.star.x * sz.w) + 'px'; b.style.top = (s.star.y * sz.h) + 'px'; A.star(); }
  }
  function updateGens(s) {
    var bulk = s.settings.bulk, shown = false, lockedShown = false;
    for (var i = 0; i < D.GENS.length; i++) {
      var c = rows.gen[i], g = D.GENS[i], n = s.gens[i], unl = E.genUnlocked(s, i);
      var vis = unl && (i === 0 || n > 0 || s.gens[i - 1] > 0 || s.light >= g.cost * 0.4);
      c.row.hidden = !vis;
      if (!vis) continue;
      var pl = E.planBuy(s, i, bulk), can = pl.n > 0 && s.light >= pl.cost && (bulk === 'max' ? E.maxAffordable(s, i) > 0 : true);
      setText(c.cnt, '× ' + n);
      var pr = E.calc(s).genProd[i] * E.buffMult(s), tot = E.prod(s);
      setText(c.ds, (n > 0 ? fmt(pr, true) + '/с · ' + (tot > 0 ? Math.round(pr / tot * 100) : 0) + '%' : g.desc + ' +' + fmt(g.prod * E.calc(s).global, true) + '/с'));
      var nm = null; for (var m = 0; m < D.BAL.milestones.length; m++) if (n < D.BAL.milestones[m]) { nm = D.BAL.milestones[m]; break; }
      c.bar.style.width = nm ? Math.min(100, n / nm * 100) + '%' : '100%'; c.bar.parentNode.title = nm ? 'До рубежа ×2: ' + nm : 'Все рубежи пройдены';
      if (n >= E.MAX_OWN) { setText(c.b, 'МАКС'); setText(c.sm, ''); can = false; }
      else { setText(c.b, fmt(pl.cost)); setText(c.sm, '×' + pl.n + (bulk === 'max' ? ' (макс)' : '')); }
      setCls(c.row, 'can', can);
    }
    var next = -1; for (i = 0; i < D.GENS.length; i++) if (!E.genUnlocked(s, i)) { next = i; break; }
    if (next >= 0) { var zz = D.ZONES[D.GENS[next].zone]; els.genLock.hidden = false; els.genLock.querySelector('.nm').textContent = 'Новые огни: ' + D.GENS[next].emoji + ' ' + D.GENS[next].name; els.genLock.querySelector('.ds').textContent = 'Откроются в зоне «' + zz.name + '» (' + fmt(zz.need) + ' света за забег)' + (zz.needAscend ? ' — после Вознесения' : ''); }
    else els.genLock.hidden = true;
  }
  var upgAvailCount = 0;
  function updateUpgrades(force) {
    var s = G.s, cnt = 0, hidden = 0;
    var vis = curTab === 'upg';
    D.UPGRADES.forEach(function (u) {
      var c = rows.upg[u.id], st = E.upgStatus(s, u);
      if (st === 'avail' && s.light >= u.cost) cnt++;
      if (!vis && !force) return;
      var show;
      if (upgFilter === 'avail') show = st === 'avail';
      else if (upgFilter === 'owned') show = st === 'owned';
      else if (upgFilter === 'all') show = true;
      else show = u.b === upgFilter;
      if (upgFilter === 'avail' && st === 'locked') hidden++;
      c.row.hidden = !show; if (!show) return;
      setCls(c.row, 'owned', st === 'owned'); setCls(c.row, 'locked', st === 'locked'); setCls(c.row, 'can', st === 'avail' && s.light >= u.cost);
      if (st === 'owned') { setText(c.b, '✔'); setText(c.sm, 'куплено'); c.req.textContent = ''; }
      else { setText(c.b, fmt(u.cost)); setText(c.sm, st === 'locked' ? 'закрыто' : ''); setText(c.req, st === 'locked' ? reqText(s, u) : ''); }
    });
    if (vis || force) setText(els.upgNote, upgFilter === 'avail' ? (hidden ? 'Ещё ' + hidden + ' улучшений откроются позже — смотри «Все»' : '') : '');
    upgAvailCount = cnt; var b = $('badge-upg'); b.hidden = cnt === 0; setText(b, String(cnt));
  }
  function updatePrestige(s) {
    var c = E.calc(s), gain = E.pearlGain(s);
    setText($('pr-gain'), '+' + fmt(gain));
    var m1 = Math.pow(1 + c.pearlEff * s.pearlsCycle, D.BAL.pearlPow), m2 = Math.pow(1 + c.pearlEff * (s.pearlsCycle + gain), D.BAL.pearlPow);
    setText($('pr-mult'), '×' + m1.toFixed(2) + ' → ×' + m2.toFixed(2));
    setText($('pr-next'), fmt(E.nextPearlAt(s)) + ' света за забег');
    var nx = E.nextPearlAt(s), prev = gain > 0 ? Math.pow(gain / (1 + c.pgain), 1 / D.BAL.pearlExp) * D.BAL.prestigeBase : 0;
    $('pr-bar').style.width = Math.max(0, Math.min(100, (s.runLight - prev) / (nx - prev) * 100)) + '%';
    $('pr-btn').disabled = gain < 1; setText($('pr-btn'), gain < 1 ? 'Нужно больше света (' + fmt(D.BAL.prestigeBase) + '+)' : 'Сделать отлив (+' + fmt(gain) + ' 🦪)');
    setText($('pr-have'), fmt(s.pearls));
    D.SHOP.forEach(function (it) {
      var r = rows.shop[it.id], own = s.shop[it.id];
      setCls(r.row, 'owned', own); setCls(r.row, 'can', !own && s.pearls >= it.cost);
      setText(r.b, own ? '✔' : '🦪 ' + fmt(it.cost)); setText(r.sm, own ? 'куплено' : '');
    });
    var sg = E.starGain(s);
    setText($('asc-gain'), '+' + fmt(sg)); setText($('asc-cycle'), fmt(s.pearlsCycle) + ' (порог ' + D.BAL.ascendBase + ')');
    var a1 = Math.pow(1 + c.starEff * s.stars, D.BAL.starPow), a2 = Math.pow(1 + c.starEff * (s.stars + sg), D.BAL.starPow);
    setText($('asc-mult'), '×' + a1.toFixed(2) + ' → ×' + a2.toFixed(2));
    var nxt = Math.pow(sg + 1, 1 / D.BAL.starExp) * D.BAL.ascendBase, prv = Math.pow(sg, 1 / D.BAL.starExp) * D.BAL.ascendBase;
    $('asc-bar').style.width = Math.max(0, Math.min(100, (s.pearlsCycle - prv) / (nxt - prv) * 100)) + '%';
    $('asc-btn').disabled = sg < 1; setText($('asc-btn'), sg < 1 ? 'Нужно ' + D.BAL.ascendBase + ' 🦪 за цикл' : 'Вознестись (+' + fmt(sg) + ' ⭐)');
    setText($('asc-have'), fmt(s.stars));
    D.PERKS.forEach(function (it) {
      var r = rows.perk[it.id], own = s.perks[it.id];
      setCls(r.row, 'owned', own); setCls(r.row, 'can', !own && s.stars >= it.cost);
      setText(r.b, own ? '✔' : '⭐ ' + fmt(it.cost)); setText(r.sm, own ? 'открыто' : '');
    });
    var b = $('badge-pres'); b.hidden = !(gain >= 1 && (s.prestiges === 0 || gain >= Math.max(1, s.pearlsCycle * 0.5))) && !(sg >= 1);
  }
  function updateRewards(s, now) {
    var info = E.dailyInfo(s, now);
    var days = $('dailyDays'); if (!days.children.length) D.DAILY.forEach(function (d, i) { days.appendChild(h('div', 'day', '<span class="e">' + d.emoji + '</span>День ' + (i + 1))); });
    Array.prototype.forEach.call(days.children, function (d, i) {
      var cyc = info.canClaim ? info.idx : info.idx; // idx текущего/последнего получения
      var done = info.canClaim ? i < info.idx : i <= info.idx;
      setCls(d, 'done', done && !(info.canClaim && i === info.idx)); setCls(d, 'now', info.canClaim && i === info.idx);
    });
    var r = D.DAILY[info.idx];
    setText($('dailyText'), info.canClaim ? 'Серия: ' + info.streak + ' дн. · сегодня: ' + r.emoji + ' ' + r.name + (info.broken ? ' (серия прервалась — начинаем заново)' : '') : (info.clock ? 'Часы устройства сбились назад — награда пока недоступна.' : 'Серия: ' + s.daily.streak + ' дн. Приходи завтра за новой наградой!'));
    $('dailyBtn').disabled = !info.canClaim; setText($('dailyBtn'), info.canClaim ? 'Забрать награду' : 'Уже получено сегодня');
    var n = 0; D.ACHIEVEMENTS.forEach(function (a) { var got = !!s.ach[a.id]; if (got) n++; setCls(rows.ach[a.id], 'got', got); });
    setText($('achCount'), '· ' + n + '/' + D.ACHIEVEMENTS.length + ' · бонус +' + E.achBonusPct(s) + '%');
    var b = $('badge-rew'); b.hidden = !info.canClaim;
  }
  function row(k, v) { return '<div class="kv"><span>' + k + '</span><span>' + v + '</span></div>'; }
  function updateStats(s) {
    var c = E.calc(s), st = s.stats, el = $('statsCard'); if (!el) return;
    var dt = new Date(s.created);
    el.innerHTML =
      row('Света сейчас', fmt(s.light)) + row('Света за всё время', fmt(s.totalLight)) + row('Света за этот забег', fmt(s.runLight)) +
      row('Выработка', fmt(E.prod(s), true) + '/с') + row('Рекорд выработки', fmt(st.maxProd, true) + '/с') + row('Сила касания', fmt(E.tapValue(s), true)) +
      row('Касаний', fmt(s.taps) + (s.autoTaps ? ' (+' + fmt(s.autoTaps) + ' авто)' : '')) + row('Событий поймано', fmt(s.events)) +
      row('Отливов', fmt(s.prestiges)) + row('Жемчужин всего / за цикл', fmt(s.pearlsAll) + ' / ' + fmt(s.pearlsCycle)) + row('Рекорд жемчужин за забег', fmt(st.bestRunPearls)) +
      row('Самый быстрый отлив', st.fastestPrestige ? U.fmtTime(st.fastestPrestige) : '—') +
      row('Вознесений', fmt(s.ascensions)) + row('Звёзд всего', fmt(s.starsAll)) +
      row('Время забега', U.fmtTime(st.runTime)) + row('Время в игре', U.fmtTime(st.playTime)) +
      row('Получено за оффлайн', fmt(st.offlineTotal) + ' (' + st.offlineCount + ' раз)') +
      row('Ежедневный вход: серия / рекорд', s.daily.streak + ' / ' + s.daily.best) +
      row('Достижений', Object.keys(s.ach).length + '/' + D.ACHIEVEMENTS.length) +
      row('Множители: 🦪 / ⭐ / 🏆', '×' + c.pearlMult.toFixed(2) + ' / ×' + c.starMult.toFixed(2) + ' / ×' + c.achMult.toFixed(2)) +
      row('Множитель зоны', '×' + c.zoneMult) + row('Общий множитель', '×' + fmt(c.global, true)) +
      row('Оффлайн: лимит / эффективность', c.offcap + ' ч / ' + Math.round(c.offeff * 100) + '%') +
      row('Начало игры', dt.toLocaleDateString('ru-RU')) +
      (st.capHit ? '<p style="color:var(--gold)">♾️ Достигнут предел чисел игры (∞ cap). Дальше числа не растут.</p>' : '');
  }
  function updateSettings(s) {
    setCls($('set-sound'), 'on', s.settings.sound); setCls($('set-part'), 'on', s.settings.particles);
    Array.prototype.forEach.call($('themeBtns').children, function (b) { b.style.outline = b.dataset.th === s.settings.theme ? '2px solid var(--gold)' : 'none'; });
  }
  function updateBulk(s) { Array.prototype.forEach.call(document.querySelectorAll('#bulkbar button'), function (b) { setCls(b, 'on', String(s.settings.bulk) === b.dataset.bulk); }); }

  function showTab(name) {
    curTab = name;
    ['gens', 'upg', 'pres', 'rew', 'more'].forEach(function (t) { $('tab-' + t).hidden = t !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { setCls(b, 'on', b.dataset.tab === name); });
    G.s.settings.tab = name;
    $('content').scrollTop = 0;
    refresh(true);
  }
  function refresh(force) {
    var s = G.s, now = Date.now();
    updateGens(s); updateUpgrades(!!force);
    if (curTab === 'pres' || force) updatePrestige(s);
    if (curTab === 'rew' || force) updateRewards(s, now);
    if (curTab === 'more' || force) { updateStats(s); updateSettings(s); }
    updateBulk(s);
  }
  var slowTimer = 0;
  function frame(dt) {
    var s = G.s; updateTop(s); updateBuffs(s); updateStar(s);
    slowTimer += dt;
    if (slowTimer > 0.4) {
      slowTimer = 0; updateGens(s); updateUpgrades(false);
      if (curTab === 'pres') updatePrestige(s);
      else { var b = $('badge-pres'); if (b._t === undefined || true) { var g = E.pearlGain(s), sg = E.starGain(s); b.hidden = !((g >= 1 && (s.prestiges === 0 || g >= Math.max(1, s.pearlsCycle * 0.5))) || sg >= 1); } }
      if (curTab === 'rew') updateRewards(s, Date.now()); else { var info = E.dailyInfo(s, Date.now()); $('badge-rew').hidden = !info.canClaim; }
      if (curTab === 'more') updateStats(s);
    }
  }

  function init(game) {
    G = game;
    ['light', 'rate', 'zoneName', 'pearlPill', 'starPill', 'pearlsN', 'starsN', 'buffTag', 'floaters', 'starBtn', 'buffs'].forEach(function (id) { els[id] = $(id); });
    els.zoneBar = $('zoneProgBar'); els.zoneText = $('zoneProgText');
    buildGens(); buildUpgrades(); buildPrestige(); buildRewards(); buildMore();
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.addEventListener('click', function () { A.click(); showTab(b.dataset.tab); }); });
    Array.prototype.forEach.call(document.querySelectorAll('#bulkbar button'), function (b) {
      b.addEventListener('click', function () { var v = b.dataset.bulk; G.s.settings.bulk = v === 'max' ? 'max' : +v; A.click(); refresh(); });
    });
    Sc.init($('cv'));
    var tapBtn = $('tapBtn');
    tapBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); var r = $('scene').getBoundingClientRect(); G.doTap(e.clientX - r.left, e.clientY - r.top); });
    tapBtn.addEventListener('click', function (e) { if (e.detail === 0) { var r = $('scene').getBoundingClientRect(); G.doTap(r.width / 2, r.height * 0.3); } });
    tapBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    els.starBtn.addEventListener('click', function (e) { e.stopPropagation(); G.doStar(); });
    document.addEventListener('keydown', function (e) { if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test((e.target || {}).tagName || '') && !modalOpen) { e.preventDefault(); var r = $('scene').getBoundingClientRect(); G.doTap(r.width / 2, r.height * 0.3); } });
    document.body.dataset.theme = G.s.settings.theme;
    showTab(['gens', 'upg', 'pres', 'rew', 'more'].indexOf(G.s.settings.tab) >= 0 ? G.s.settings.tab : 'gens');
  }

  root.MayakUI = { init: init, toast: toast, modal: modal, floatText: floatText, refresh: refresh, frame: frame, showTab: showTab, esc: esc, updateSettings: updateSettings };
})(typeof self !== 'undefined' ? self : this);

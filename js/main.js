/* Контроллер игры: загрузка, цикл, действия игрока, PWA. */
(function (root) {
  'use strict';
  var U = root.MayakUtil, D = root.MayakData, E = root.MayakEngine, S = root.MayakSave, A = root.MayakAudio, Sc = root.MayakScene, UI = root.MayakUI;
  var fmt = U.fmt, $ = function (id) { return document.getElementById(id); };
  var G = { s: null }, lastT = 0, lastSave = 0, lastAch = 0, hiddenAt = 0, combo = 0, comboAt = 0, storageOk = true, swReg = null, resetting = false;

  function persist() {
    if (resetting || !G.s) return;
    if (!S.save(G.s)) { if (storageOk) { storageOk = false; UI.toast('⚠️ Не удалось сохранить в браузере. Сделай экспорт кода в «Ещё».', { persist: false }); } }
    lastSave = Date.now();
  }
  G.save = persist;

  function applyZoneScene() { Sc.setZone(D.ZONES[G.s.zone], G.s.zone); }
  function applySettings() {
    var st = G.s.settings;
    A.setEnabled(st.sound); Sc.setParticles(st.particles); document.body.dataset.theme = st.theme;
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = st.theme === 'dawn' ? '#2a1f3d' : st.theme === 'dark' ? '#000000' : '#0f1b3a';
  }

  function notifyAch(list) {
    list.forEach(function (a, i) {
      setTimeout(function () { UI.toast('🏆 <b>' + UI.esc(a.name) + '</b><br><small>' + UI.esc(a.desc) + ' · +' + a.b + '% выработки</small>'); }, i * 350);
    });
    if (list.length) { A.achieve(); E.dirty(G.s); }
  }

  G.doTap = function (x, y) {
    var s = G.s, v = E.tap(s), now = Date.now();
    combo = now - comboAt < 400 ? combo + 1 : 0; comboAt = now;
    A.unlock(); A.tap(combo);
    var big = combo > 0 && combo % 10 === 0;
    UI.floatText(x + (Math.random() * 30 - 15), y - 10, '+' + fmt(v, true), big);
    var lp = Sc.lanternPos(); Sc.burst(lp.x, lp.y, big ? 14 : 4, '#ffe9a0', big ? 140 : 70, 60); Sc.pulse(0.35);
    var lg = $('light'); lg.classList.remove('pop'); void lg.offsetWidth; lg.classList.add('pop');
  };

  G.buyGen = function (i, c) {
    var s = G.s, bulk = s.settings.bulk, before = s.gens[i];
    var n = E.buyGen(s, i, bulk);
    if (!n) { A.error(); if (c) { c.row.classList.remove('fx-shake'); void c.row.offsetWidth; c.row.classList.add('fx-shake'); } return; }
    A.buy();
    var ms = D.BAL.milestones, hit = false;
    ms.forEach(function (m) { if (before < m && s.gens[i] >= m) hit = true; });
    if (hit) { UI.toast('🎉 ' + D.GENS[i].emoji + ' <b>' + D.GENS[i].name + '</b>: рубеж — выработка ×2!'); if (c) { c.row.classList.add('ms'); setTimeout(function () { c.row.classList.remove('ms'); }, 600); } A.upgrade(); Sc.pulse(1); }
    var r = c && c.row.getBoundingClientRect(), sr = $('scene').getBoundingClientRect();
    if (r) UI.floatText(r.right - 60 - sr.left, Math.max(20, r.top - sr.top), '+' + n + ' ' + D.GENS[i].emoji, false);
    checkAchNow(); UI.refresh();
  };
  G.buyUpgrade = function (id, c) {
    if (E.buyUpgrade(G.s, id)) { A.upgrade(); Sc.pulse(0.8); UI.toast('🛠️ <b>' + D.UPG[id].name + '</b> — ' + D.UPG[id].desc); checkAchNow(); UI.refresh(true); }
    else A.error();
  };
  G.buyShop = function (id) { if (E.buyShop(G.s, id)) { A.upgrade(); checkAchNow(); UI.refresh(true); } else A.error(); };
  G.buyPerk = function (id) { if (E.buyPerk(G.s, id)) { A.upgrade(); checkAchNow(); UI.refresh(true); } else A.error(); };

  G.doStar = function () {
    var s = G.s, kind = s.star && s.star.kind, res = E.clickStar(s);
    if (!res) return;
    A.catchStar();
    var sr = $('scene').getBoundingClientRect(), sz = Sc.size();
    Sc.burst(parseFloat($('starBtn').style.left) || sz.w / 2, parseFloat($('starBtn').style.top) || sz.h / 2, 30, '#ffd76a', 180, 80);
    $('starBtn').hidden = true;
    var msg = res.gain ? 'Найдено <b>+' + fmt(res.gain) + '</b> света!' : '<b>' + res.name + '</b> на ' + Math.round(res.dur) + ' с!';
    UI.toast('⭐ ' + msg);
    if (res.gain) UI.floatText(sz.w / 2, sz.h / 2, '+' + fmt(res.gain), true);
    checkAchNow();
  };

  G.askPrestige = function () {
    var s = G.s, g = E.pearlGain(s);
    if (g < 1) { A.error(); return; }
    var c = E.calc(s);
    UI.modal({ emoji: '🌊', title: 'Отлив', body: '<p>Свет, огни и улучшения будут сброшены. Ты получишь</p><div class="big">+' + fmt(g) + ' 🦪</div><p>Множитель выработки: ×' + Math.pow(1 + c.pearlEff * s.pearlsCycle, D.BAL.pearlPow).toFixed(2) + ' → ×' + Math.pow(1 + c.pearlEff * (s.pearlsCycle + g), D.BAL.pearlPow).toFixed(2) + '. Достижения, жемчужины и дары остаются.</p>',
      buttons: [{ text: 'Отмена', cls: 'ghost' }, { text: 'Отлив!', cls: 'gold', onClick: function () {
        var got = E.prestige(s); A.prestige(); document.body.classList.add('fx-flash'); setTimeout(function () { document.body.classList.remove('fx-flash'); }, 950);
        UI.toast('🌊 Отлив! <b>+' + fmt(got) + ' 🦪</b>'); applyZoneScene(); checkAchNow(); persist(); UI.refresh(true);
      } }] });
  };
  G.askAscend = function () {
    var s = G.s, g = E.starGain(s);
    if (g < 1) { A.error(); return; }
    UI.modal({ emoji: '🌠', title: 'Вознесение', body: '<p>Будет сброшено <b>всё</b>: свет, огни, улучшения, 🦪 жемчужины и дары глубин' + (E.calc(s).keepPearls ? ' (кроме ' + Math.round(E.calc(s).keepPearls * 100) + '% жемчужин)' : '') + '.</p><div class="big">+' + fmt(g) + ' ⭐</div><p>Звёзды и созвездия остаются навсегда. Откроется зона «Край мироздания».</p>',
      buttons: [{ text: 'Отмена', cls: 'ghost' }, { text: 'Вознестись', cls: 'purple', onClick: function () {
        var got = E.ascend(s); A.ascend(); document.body.classList.add('fx-flash'); setTimeout(function () { document.body.classList.remove('fx-flash'); }, 950);
        UI.toast('🌠 Вознесение! <b>+' + fmt(got) + ' ⭐</b>'); applyZoneScene(); checkAchNow(); persist(); UI.refresh(true);
      } }] });
  };

  G.claimDaily = function () {
    var s = G.s, r = E.claimDaily(s, Date.now());
    if (!r) { A.error(); return; }
    A.achieve();
    var parts = [];
    if (r.gain) parts.push('+' + fmt(r.gain) + ' света');
    if (r.pearls) parts.push('+' + r.pearls + ' 🦪');
    if (r.reward.kind === 'buff') parts.push(r.reward.name);
    UI.modal({ emoji: r.reward.emoji, title: 'День ' + ((r.streak - 1) % 7 + 1) + ' · серия ' + r.streak, body: '<div class="big">' + parts.join('<br>') + '</div><p>Заходи каждый день — награды растут, а на 7-й день ждёт подарок!</p>' });
    checkAchNow(); persist(); UI.refresh(true);
  };

  G.setTheme = function (t) { G.s.settings.theme = t; applySettings(); UI.refresh(true); persist(); };
  G.toggle = function (k) { G.s.settings[k] = !G.s.settings[k]; applySettings(); if (k === 'sound' && G.s.settings.sound) A.click(); UI.refresh(true); persist(); };

  G.showExport = function () {
    persist();
    var code = S.exportCode(G.s);
    UI.modal({ emoji: '📤', title: 'Экспорт сохранения', body: '<p>Скопируй код и сохрани его. Его можно вставить в «Импорт» на любом устройстве.</p><textarea id="expTa" readonly></textarea>',
      onOpen: function (m) { m.querySelector('#expTa').value = code; },
      buttons: [{ text: '📋 Копировать', cls: 'gold', keep: true, onClick: function (m, bt) {
        var ta = m.querySelector('#expTa'); ta.select();
        var done = function () { bt.textContent = '✔ Скопировано'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { try { document.execCommand('copy'); done(); } catch (e) {} });
        else { try { document.execCommand('copy'); done(); } catch (e) {} }
      } }, { text: 'Закрыть', cls: 'ghost' }] });
  };
  G.showImport = function () {
    UI.modal({ emoji: '📥', title: 'Импорт сохранения', body: '<p>Вставь код сохранения. Текущий прогресс будет заменён.</p><textarea id="impTa" placeholder="MAYAK1:..."></textarea><p id="impErr" style="color:var(--bad);min-height:1.2em"></p>',
      buttons: [{ text: 'Отмена', cls: 'ghost' }, { text: 'Загрузить', cls: 'gold', id: 'impGo', keep: true, onClick: function (m) {
        var v = m.querySelector('#impTa').value;
        try {
          var ns = S.importCode(v, Date.now());
          if (!confirm('Заменить текущее сохранение импортированным?\nСвета в коде: ' + fmt(ns.totalLight) + ', отливов: ' + ns.prestiges + ', вознесений: ' + ns.ascensions)) return;
          G.s = ns; persist(); location.reload();
        } catch (e) {
          m.querySelector('#impErr').textContent = e.message === 'newer' ? 'Код создан более новой версией игры.' : 'Неверный или повреждённый код.';
          A.error();
        }
      } }] });
  };
  G.askReset = function () {
    UI.modal({ emoji: '⚠️', title: 'Полный сброс', body: '<p>Весь прогресс (включая жемчужины, звёзды и достижения) будет <b>удалён безвозвратно</b>. Введи слово <b>СБРОС</b>, чтобы подтвердить.</p><input id="rstIn" type="text" autocomplete="off" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:16px;-webkit-user-select:text;user-select:text">',
      buttons: [{ text: 'Отмена', cls: 'ghost' }, { text: 'Стереть всё', cls: 'red', id: 'rstGo', keep: true, onClick: function (m) {
        if (m.querySelector('#rstIn').value.trim().toUpperCase() !== 'СБРОС') { A.error(); return; }
        resetting = true;
        try { localStorage.removeItem(D.SAVE_KEY); localStorage.removeItem(D.BACKUP_KEY); localStorage.removeItem(D.SAVE_KEY + '.corrupt'); } catch (e) {}
        location.reload();
      } }] });
  };

  /* ---------- обновления PWA ---------- */
  var updToast = null;
  function showUpdate(reg) {
    if (updToast) return;
    updToast = UI.toast('🔄 Доступна новая версия игры<button class="btn gold" id="updGo">Обновить сейчас</button>', { persist: true });
    updToast.querySelector('#updGo').addEventListener('click', function () {
      persist();
      var w = reg.waiting; if (w) w.postMessage({ type: 'SKIP_WAITING' }); else location.reload();
    });
  }
  G.checkUpdate = function (manual) {
    if (!swReg) { if (manual) UI.toast('Обновления недоступны в этом режиме.'); return; }
    swReg.update().then(function () { if (manual) setTimeout(function () { if (!swReg.waiting && !swReg.installing) UI.toast('У тебя последняя версия ✅'); }, 800); }).catch(function () { if (manual) UI.toast('Нет сети — проверю позже.'); });
  };
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    var reloading = false, hadController = !!navigator.serviceWorker.controller;
    // Перезагружаемся только при обновлении версии (когда уже был контроллер), а не при первой установке SW.
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloading || !hadController) return; reloading = true; persist(); location.reload(); });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      swReg = reg; root.__swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); });
      });
      setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
    }).catch(function (e) { console.warn('SW:', e && e.message); });
  }

  /* ---------- цикл ---------- */
  function checkAchNow() { notifyAch(E.checkAch(G.s, Date.now())); }
  function loop() {
    var now = Date.now();
    if (document.hidden) { lastT = now; return; }
    var dt = (now - lastT) / 1000; lastT = now;
    if (dt < 0) dt = 0;
    if (dt > 90) dt = 90; // сон между кадрами без hidden: считаем как обычное время
    var notes = E.tick(G.s, dt);
    notes.forEach(function (n) {
      if (n.t === 'zone') {
        var z = D.ZONES[n.z]; A.zone(); applyZoneScene();
        UI.modal({ emoji: z.emoji, title: 'Новая зона: ' + z.name, body: '<p>' + z.desc + '</p><p>Выработка ×' + z.mult + ', открыты новые огни!</p>' });
        Sc.pulse(1.5);
      }
    });
    if (now - lastAch > 1000) { lastAch = now; checkAchNow(); }
    if (now - lastSave > D.BAL.saveEvery * 1000) persist();
    UI.frame(dt);
  }

  function showWelcome(r) {
    var s = G.s;
    UI.modal({ emoji: '🌙', title: 'С возвращением, смотритель!', body: '<p>Тебя не было <b>' + U.fmtTime(r.elapsed) + '</b>. Маяк светил всё это время' + (r.capped ? ' (учтено не более ' + r.capHours + ' ч)' : '') + '.</p><div class="big">+' + fmt(r.gain) + '</div><p>света при эффективности ' + Math.round(r.eff * 100) + '%.</p>',
      buttons: [{ text: 'Забрать!', cls: 'gold' }] });
  }
  function onVisible() {
    var now = Date.now(); if (!hiddenAt) { lastT = now; return; }
    var gap = (now - hiddenAt) / 1000; hiddenAt = 0;
    if (gap >= 60) { var r = E.applyOffline(G.s, now); if (r) { showWelcome(r); applyZoneScene(); checkAchNow(); } }
    else { E.tick(G.s, Math.max(0, Math.min(gap, 60))); }
    lastT = Date.now(); UI.refresh(true);
  }

  function start() {
    var res = S.load(null, Date.now());
    G.s = res.state; G.loadStatus = res.status;
    if (res.status === 'restored-backup') setTimeout(function () { UI.toast('⚠️ Сохранение повреждено — восстановлена резервная копия.'); }, 500);
    else if (res.status.indexOf('corrupt') === 0) setTimeout(function () { UI.toast('⚠️ Сохранение повреждено и не восстановлено. Начата новая игра (старые данные сохранены отдельно).'); }, 500);
    try { localStorage.setItem('mayak.probe', '1'); localStorage.removeItem('mayak.probe'); } catch (e) { storageOk = false; setTimeout(function () { UI.toast('⚠️ Хранилище браузера недоступно — прогресс не сохранится. Используй экспорт.'); }, 800); }
    var s = G.s, now = Date.now();
    UI.init(G); applySettings(); applyZoneScene(); Sc.start();
    if (res.status === 'ok' || res.status === 'restored-backup') {
      var r = E.applyOffline(s, now);
      if (r) { setTimeout(function () { showWelcome(r); }, 350); applyZoneScene(); }
    }
    if (s.stats.playTime === 0 && s.taps === 0) setTimeout(function () { UI.toast('👆 Коснись маяка, чтобы зажечь свет!'); }, 600);
    var di = E.dailyInfo(s, now);
    if (di.canClaim) setTimeout(function () { UI.toast('📅 Ежедневная награда ждёт — вкладка «Награды»'); }, 1200);
    E.checkAch(s, now); lastT = now; lastSave = now;
    UI.refresh(true);
    setInterval(loop, 100);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); persist(); } else onVisible();
    });
    root.addEventListener('pagehide', function () { persist(); });
    root.addEventListener('beforeunload', function () { persist(); });
    root.addEventListener('storage', function (e) {
      if (e.key === D.SAVE_KEY && e.newValue && !resetting) UI.toast('ℹ️ Игра открыта в другой вкладке — прогресс может перезаписаться.');
    });
    registerSW();
    root.__mayak = G;
  }
  root.MayakGame = G;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof self !== 'undefined' ? self : this);

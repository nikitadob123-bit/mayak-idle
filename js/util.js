/* Утилиты: безопасная математика и форматирование чисел. UMD: работает в браузере и в Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MayakUtil = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CAP = 1e300; // предел игры: всё, что больше, обрезается и показывается как «∞ cap»

  function clamp(x) {
    x = +x;
    if (x !== x) return 0;          // NaN
    if (x < 0) return 0;
    if (x > CAP) return CAP;        // включая Infinity
    return x;
  }
  function isCap(n) { return n >= CAP || n === Infinity; }

  var SUF = ['', 'K', 'M', 'B', 'T'];
  /** Формат целых величин: 1.23K, 45.6M, 7.89B, 1.23T, затем научная запись 1.23e15. */
  function fmt(n, rate) {
    n = +n;
    if (n !== n) return '0';
    if (n < 0) return '-' + fmt(-n, rate);
    if (isCap(n)) return '∞ cap';
    if (n < 1000) {
      if (rate || (n < 10 && n % 1 !== 0 && false)) {
        if (n === 0) return '0';
        if (n < 10) return trim(n.toFixed(2));
        if (n < 100) return trim(n.toFixed(1));
      }
      return String(Math.floor(n + 1e-9));
    }
    if (n < 1e15) {
      var idx = Math.floor(Math.log10(n) / 3);
      if (idx > 4) idx = 4;
      var v = n / Math.pow(1000, idx);
      var s = digits(v);
      if (parseFloat(s) >= 1000 && idx < 4) { idx++; s = digits(n / Math.pow(1000, idx)); }
      return s + SUF[idx];
    }
    var e = Math.floor(Math.log10(n));
    var m = n / Math.pow(10, e);
    if (m >= 10) { m /= 10; e++; }       // защита от ошибок округления
    if (m < 1) { m *= 10; e--; }
    var ms = m.toFixed(2);
    if (parseFloat(ms) >= 10) { ms = '1.00'; e++; }
    return ms + 'e' + e;
  }
  function digits(v) { return v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0); }
  function trim(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function fmtRate(n) { return fmt(n, true); }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (d > 0) return d + 'д ' + h + 'ч';
    if (h > 0) return h + 'ч ' + m + 'м';
    if (m > 0) return m + 'м ' + (s < 10 ? '0' : '') + s + 'с';
    return s + 'с';
  }

  /** Маленький детерминированный ГСЧ (mulberry32) для тестов и симуляции. */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { CAP: CAP, clamp: clamp, isCap: isCap, fmt: fmt, fmtRate: fmtRate, fmtTime: fmtTime, makeRng: makeRng };
});

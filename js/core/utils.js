/* ============================================================
   utils.js — tiny helpers shared by every other module.
   No DOM ownership, no state: pure functions plus the toast.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.util = (function () {

  /** HTML-escape anything we inject as text. */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** 1181116000 -> "1.1 GiB" */
  function human(b) {
    if (!b) return '0 B';
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = Math.floor(Math.log(b) / Math.log(1024));
    i = Math.min(i, u.length - 1);
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** Percentage of a bar, floored so tiny values stay visible. */
  function pct(v, max) { return Math.max(3, Math.round(v / max * 100)); }

  /** Minimal shell highlighter for the command previews. */
  function highlight(code) {
    let h = esc(code);
    h = h.replace(/(^|\n)(\s*#[^\n]*)/g, '$1<span class="cm">$2</span>');
    h = h.replace(
      /\b(docker|aws|s3|spark-submit|pyspark|python3|export|alias|cat|chmod|mkdir|sudo|sleep|diff|az|pkill|echo|time|tail)\b/g,
      '<span class="kw">$1</span>');
    h = h.replace(/\b(s3a?:\/\/[^\s'"]+)/g, '<span class="st">$1</span>');
    return h;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  /** Re-trigger a CSS animation that is already on the element. */
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function copy(text, msg) {
    navigator.clipboard.writeText(text).then(() => toast(msg || 'Copied'));
  }

  return { esc, human, sleep, pct, highlight, toast, replay, copy };
})();

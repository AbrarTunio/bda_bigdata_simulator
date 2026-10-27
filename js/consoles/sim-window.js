/* ============================================================
   sim-window.js — floating windows drawn on top of the lab.

   This is what replaces window.open(). A real popup would carry
   the host browser's own address bar, showing whatever path the
   simulator is served from, right above the address bar we draw
   ourselves. Two URLs contradicting each other teaches the wrong
   thing, so the console is a window we draw instead: it can be
   moved, resized, maximised, minimised and closed, and the only
   URL on it is the one the real console would show.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.simWindow = (function () {

  const open = {};            // id -> record
  let dock = null;
  let z = 500;
  let cascade = 0;

  function dockEl() {
    if (!dock) {
      dock = document.createElement('div');
      dock.className = 'simdock';
      document.body.appendChild(dock);
    }
    return dock;
  }

  /** Where a new window lands: roughly centred, each one nudged along. */
  function place(w, h) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(w, vw - 40);
    const height = Math.min(h, vh - 40);
    const off = (cascade++ % 3) * 26;
    return {
      width, height,
      left: Math.max(12, Math.round((vw - width) / 2) + off - 26),
      top: Math.max(12, Math.round((vh - height) / 2) + off - 26)
    };
  }

  function focus(id) {
    const rec = open[id];
    if (!rec) return;
    rec.el.style.zIndex = ++z;
    rec.el.classList.remove('min');
    paintDock();
  }

  function paintDock() {
    const d = dockEl();
    d.innerHTML = '';
    Object.keys(open).forEach(id => {
      const rec = open[id];
      if (!rec.el.classList.contains('min')) return;
      const b = document.createElement('button');
      b.innerHTML = '<span>' + rec.fav + '</span><span>' + rec.label + '</span>';
      b.title = 'Restore ' + rec.label;
      b.onclick = () => focus(id);
      d.appendChild(b);
    });
  }

  /* ---------- dragging and resizing ---------- */

  function drag(rec, e) {
    if (rec.el.classList.contains('max')) return;
    if (e.target.closest('button, .cr-tab .x, .cr-wc')) return;
    e.preventDefault();

    const r = rec.el.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    rec.el.classList.add('dragging');

    function move(ev) {
      const left = Math.min(Math.max(-r.width + 90, ev.clientX - dx), window.innerWidth - 90);
      const top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40);
      rec.el.style.left = left + 'px';
      rec.el.style.top = top + 'px';
    }
    function up() {
      rec.el.classList.remove('dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function resize(rec, e) {
    e.preventDefault();
    const r = rec.el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    rec.el.classList.add('dragging');

    function move(ev) {
      rec.el.style.width = Math.max(520, r.width + ev.clientX - sx) + 'px';
      rec.el.style.height = Math.max(360, r.height + ev.clientY - sy) + 'px';
    }
    function up() {
      rec.el.classList.remove('dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /* ---------- the API ---------- */

  /**
   * Open a window, or focus it if it is already up.
   * @param {object} opts {id, label, fav, width, height, mount(rootEl, win)}
   */
  function show(opts) {
    const id = opts.id;
    if (open[id]) { focus(id); return open[id].api; }

    const box = place(opts.width || 1180, opts.height || 760);
    const el = document.createElement('div');
    el.className = 'simwin';
    el.style.cssText =
      'left:' + box.left + 'px;top:' + box.top + 'px;' +
      'width:' + box.width + 'px;height:' + box.height + 'px;z-index:' + (++z);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
    el.appendChild(body);

    const grip = document.createElement('div');
    grip.className = 'simwin-grip';
    grip.title = 'Resize';
    el.appendChild(grip);

    document.body.appendChild(el);

    const rec = { el, label: opts.label || id, fav: opts.fav || '', api: null };
    open[id] = rec;

    const api = {
      id,
      el,
      close() { destroy(id); },
      minimize() { el.classList.add('min'); paintDock(); },
      toggleMax() { el.classList.toggle('max'); },
      focus() { focus(id); }
    };
    rec.api = api;

    // The app draws its browser into `body` and hands back the chrome,
    // so the window controls can live in the tab strip where they belong.
    const app = opts.mount(body, api);
    rec.app = app;

    if (app && app.chrome) {
      app.chrome.controls.innerHTML =
        '<button class="min" title="Minimize">─</button>' +
        '<button class="max" title="Maximize">□</button>' +
        '<button class="close" title="Close">✕</button>';
      app.chrome.controls.querySelector('.min').onclick = api.minimize;
      app.chrome.controls.querySelector('.max').onclick = api.toggleMax;
      app.chrome.controls.querySelector('.close').onclick = api.close;
      app.chrome.tabs.addEventListener('mousedown', e => drag(rec, e));
      app.chrome.tabs.addEventListener('dblclick', e => {
        if (!e.target.closest('button, .cr-wc, .cr-tab .x')) api.toggleMax();
      });
    }

    grip.addEventListener('mousedown', e => resize(rec, e));
    el.addEventListener('mousedown', () => { el.style.zIndex = ++z; }, true);

    paintDock();
    return api;
  }

  function destroy(id) {
    const rec = open[id];
    if (!rec) return;
    if (rec.app && rec.app.destroy) rec.app.destroy();
    rec.el.remove();
    delete open[id];
    paintDock();
  }

  function closeAll() { Object.keys(open).forEach(destroy); }
  function isOpen(id) { return !!open[id]; }

  return { show, close: destroy, closeAll, isOpen };
})();

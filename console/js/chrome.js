/* ============================================================
   chrome.js — draws a browser inside an element.

   Nothing here opens a real window. The tab strip, the address
   bar, the back/forward/reload buttons and the loading flash are
   painted into whatever element you hand it, so the URL the
   student reads is the one the real thing would show — not the
   path this file happens to be served from.

   Usage:
     const cr = BrowserChrome.create(el, {
       favicon, title, origin, secure, start, render, onClose
     });
     cr.start();                 // navigate to cfg.start
     cr.go('/some/path');        // pushes history, repaints
     cr.setOrigin('other.host'); // the address bar changes host
     cr.view                     // the element a page renders into
   ============================================================ */

window.BrowserChrome = (function () {

  const LOCK_SECURE =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 ' +
    '0-2-2h-1V6a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3z"/></svg>';

  const LOCK_PLAIN =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';

  const FRAME =
    '<div class="cr-tabs">' +
      '<div class="cr-tab">' +
        '<span class="fav"></span><span class="ttl"></span>' +
        '<span class="x" title="Close tab">×</span>' +
      '</div>' +
      '<div class="cr-newtab">+</div>' +
      '<div class="cr-wc"></div>' +
    '</div>' +
    '<div class="cr-bar">' +
      '<button class="cr-btn cr-back" title="Back">←</button>' +
      '<button class="cr-btn cr-fwd" title="Forward">→</button>' +
      '<button class="cr-btn cr-reload" title="Reload">⟳</button>' +
      '<div class="cr-omni">' +
        '<span class="lock"></span><span class="url"></span><span class="star">☆</span>' +
      '</div>' +
      '<div class="cr-avatar">S</div>' +
    '</div>' +
    '<div class="cr-page">' +
      '<div class="cr-load"></div>' +
      '<div class="cr-view"></div>' +
    '</div>' +
    '<div class="cr-sim">simulated browser · nothing leaves this page</div>';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Draw a browser into `root` and return a handle to it. Every
   * lookup is scoped to `root`, so several can be open at once.
   */
  function create(root, cfg) {
    root.classList.add('cr-root');
    root.innerHTML = FRAME;

    const q = sel => root.querySelector(sel);
    const elTitle = q('.cr-tab .ttl');
    const elUrl   = q('.cr-omni .url');
    const elLock  = q('.cr-omni .lock');
    const elBack  = q('.cr-back');
    const elFwd   = q('.cr-fwd');
    const elLoad  = q('.cr-load');
    const elPage  = q('.cr-page');
    const view    = q('.cr-view');

    let stack = [];      // visited paths, oldest first
    let at = -1;         // index into stack
    let origin = cfg.origin;
    let title = cfg.title;

    q('.cr-tab .fav').innerHTML = cfg.favicon || '';
    elLock.innerHTML = cfg.secure ? LOCK_SECURE : LOCK_PLAIN;
    elLock.className = 'lock' + (cfg.secure ? '' : ' insecure');

    /** Chrome renders the host darker than the rest of the URL. */
    function paintUrl() {
      elUrl.innerHTML = '<span>' + esc(origin) + '</span>' +
                        '<span class="dim">' + esc(stack[at] || '') + '</span>';
      elTitle.textContent = title;
      if (cfg.onTitle) cfg.onTitle(title);
    }

    function paintButtons() {
      elBack.disabled = at <= 0;
      elFwd.disabled = at >= stack.length - 1;
    }

    function paintPage() {
      elLoad.classList.add('on');
      elLoad.style.width = '35%';
      setTimeout(() => { elLoad.style.width = '100%'; }, 90);
      setTimeout(() => { elLoad.classList.remove('on'); elLoad.style.width = '0'; }, 420);

      paintButtons();
      cfg.render(stack[at] || '');
      paintUrl();
      elPage.scrollTop = 0;
    }

    /** Navigate, pushing onto history. */
    function go(p) {
      if (stack[at] === p) { paintPage(); return; }
      stack = stack.slice(0, at + 1);
      stack.push(p);
      at = stack.length - 1;
      paintPage();
    }

    /** Re-render the current path without touching history. */
    function repaint() { cfg.render(stack[at] || ''); paintUrl(); }

    /** First navigation. Separate from create() so the caller has the
        handle before render() is ever asked for a page. */
    function start()  { go(cfg.start || '/'); }

    function back()   { if (at > 0) { at--; paintPage(); } }
    function fwd()    { if (at < stack.length - 1) { at++; paintPage(); } }
    function reload() { paintPage(); }
    function path()   { return stack[at] || ''; }

    function setTitle(t) { title = t; paintUrl(); }
    /** AWS moves between service consoles, so the host can change. */
    function setOrigin(o) { origin = o; paintUrl(); }

    elBack.onclick = back;
    elFwd.onclick = fwd;
    q('.cr-reload').onclick = reload;
    q('.cr-tab .x').onclick = () => { if (cfg.onClose) cfg.onClose(); };

    const api = {
      go, back, fwd, reload, repaint, path, setTitle, setOrigin, start,
      view: view, root: root, controls: q('.cr-wc'), tabs: q('.cr-tabs')
    };

    // The caller navigates to the first page itself, with start().
    // Doing it here would call cfg.render() before the caller has
    // the handle it needs to draw into.
    return api;
  }

  return { create };
})();

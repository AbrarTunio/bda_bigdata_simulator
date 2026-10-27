/* ============================================================
   standalone.js — boots a console when console/minio.html or
   console/aws.html is opened on its own.

   The lab itself never loads this file. It draws both consoles
   inside index.html as floating windows, because a real second
   window would carry the host browser's own address bar and
   contradict the one the console draws.

   These pages exist for one narrow case: looking at a console
   on its own, e.g. to project it. They are a read-only mirror
   of whatever the lab last wrote to localStorage, so the view
   is real but nothing you click can change the lab.
   ============================================================ */
(function () {

  const LIVE_KEY = 'bda-sim-live';
  const EMPTY = { env: {}, files: [], bucketCreated: false, cluster: {}, cost: null, sessionCost: 0 };

  let snap = null;
  const listeners = [];

  function read() {
    try {
      const raw = localStorage.getItem(LIVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }      // file:// gives an opaque origin
  }

  function refresh() {
    const next = read();
    if (!next) return;
    if (snap && next.t && snap.t && next.t <= snap.t) return;
    snap = next;
    listeners.slice().forEach(fn => { try { fn(snap); } catch (e) {} });
  }

  const store = {
    state: () => snap || EMPTY,
    send: () => {},                   // read-only mirror: actions go nowhere
    onChange(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
    refresh,
    close() { try { window.close(); } catch (e) {} }
  };

  function boot() {
    const kind = document.body.dataset.console;      // "minio" | "aws"
    const app = BDA.apps[kind];
    if (!app) return;

    document.documentElement.classList.add('cr-standalone');
    refresh();
    app.mount(document.getElementById('crRoot'), store);

    const note = document.querySelector('.cr-sim');
    if (note) note.textContent = 'simulated browser \u00B7 read-only mirror of the lab';

    setInterval(refresh, 700);                       // the lab may be in another tab
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();

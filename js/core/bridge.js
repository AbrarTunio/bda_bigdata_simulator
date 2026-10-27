/* ============================================================
   bridge.js — the link between the lab and the simulated
   console windows drawn on top of it.

   The consoles used to be real popups, which needed postMessage
   and a localStorage fallback. They are now drawn inside this
   same document, so the "bridge" is just a small in-process bus:

     snapshot()            — the lean projection consoles render
     on(action, fn)        — register a command handler
     dispatch(action, p)   — a console asks the lab to do something
     subscribe(fn)         — a console wants to know when state moves

   The localStorage mirror is kept for one reason: console/*.html
   can still be opened directly in another tab, and that copy
   reads the snapshot from storage. Nothing in the lab depends
   on it.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.bridge = (function () {

  const LIVE_KEY = 'bda-sim-live';
  const subs = [];

  /** The lean projection the consoles actually render. */
  function snapshot() {
    const S = BDA.state.S;
    return {
      t: Date.now(),
      env: S.env,
      files: S.files.map(f => ({ path: f.path, size: f.size, count: f.count })),
      bucketCreated: S.bucketCreated,
      cluster: S.cluster,
      cost: S.cost,
      sessionCost: S.sessionCost
    };
  }

  function publish() {
    const snap = snapshot();
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(snap)); } catch (e) {}
    subs.slice().forEach(fn => { try { fn(snap); } catch (e) {} });
  }

  /** @returns {function} unsubscribe */
  function subscribe(fn) {
    subs.push(fn);
    return function () {
      const i = subs.indexOf(fn);
      if (i !== -1) subs.splice(i, 1);
    };
  }

  /* ---- inbound: commands issued from a console window ---- */
  const handlers = {};
  function on(action, fn) { handlers[action] = fn; }
  function dispatch(action, payload) {
    const fn = handlers[action];
    if (fn) fn(payload || {});
    publish();
  }

  function init() {
    // Re-publish whenever the lab state moves.
    BDA.state.onChange(publish);
    publish();
  }

  return { init, publish, subscribe, on, dispatch, snapshot };
})();

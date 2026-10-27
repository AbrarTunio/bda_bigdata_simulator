/* ============================================================
   state.js — the whole lab lives in one object.
   Everything else reads BDA.state.S and calls BDA.state.save().
   ============================================================ */
window.BDA = window.BDA || {};

BDA.state = (function () {

  const KEY = 'bda-sim';

  function fresh() {
    return {
      done: {},                  // id -> true   (steps and individual commands)
      cwd: '~',
      env: {
        docker: false, minio: false, cli: false,
        region: null, awsAcct: null,
        minioSeen: false, awsConsoleSeen: false, credsRemoved: false
      },
      files: [],                 // {path, size, count?}  keys inside the bucket
      local: [],                 // {name, note?}         files in ~/lab8 or ~/lab3
      bucketCreated: false,
      runtime: null,             // measured spark-submit wall time, in hours
      cost: null,                // computed cost breakdown
      cluster: { active: false, stageIndex: -1, terminated: false, proven: false },
      sessionCost: 0
    };
  }

  // The live object. Re-pointed on reset, so always read through BDA.state.S.
  let S = fresh();

  const listeners = [];
  /** Subscribe to "state changed" — used by the window bridge. */
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => { try { fn(S); } catch (e) {} }); }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        done: S.done, env: S.env, files: S.files, local: S.local,
        bucketCreated: S.bucketCreated, cost: S.cost, runtime: S.runtime,
        cluster: {
          terminated: S.cluster.terminated,
          proven: S.cluster.proven,
          stageIndex: S.cluster.terminated ? 6 : -1,
          active: false
        }
      }));
    } catch (e) { /* private mode — run in memory only */ }
    emit();
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      S = fresh();
      Object.assign(S, d);
      if (!S.cluster) S.cluster = fresh().cluster;
      if (!S.env) S.env = fresh().env;
      api.S = S;
      return true;
    } catch (e) { return false; }
  }

  function reset() {
    S = fresh();
    api.S = S;
    try { localStorage.removeItem(KEY); } catch (e) {}
    emit();
  }

  const api = { S, fresh, save, load, reset, onChange, emit };
  return api;
})();

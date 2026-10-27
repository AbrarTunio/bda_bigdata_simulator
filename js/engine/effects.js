/* ============================================================
   effects.js — the only place that mutates lab state.

   Each command in js/data carries an `fx` key; running it looks
   the key up here. Keeping every mutation in one table is what
   makes the step data safe to edit without touching logic.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.effects = (function () {

  /* ---- cost model: the same arithmetic cost.py prints ---- */
  const MODEL = {
    RUNTIME: 0.75,   // cluster lifetime in hours, incl. ~8 min startup
    CORE: 4, PRIMARY: 1,
    ON_DEMAND: 0.214,  // m5.xlarge, eu-west-1
    UPLIFT: 0.054,     // EMR per-instance-hour service charge
    SPOT_DISC: 0.70,
    GB_SCANNED: 20
  };

  function computeCost() {
    const m = MODEL;
    const ih = (m.CORE + m.PRIMARY) * m.RUNTIME;
    const od = ih * m.ON_DEMAND + ih * m.UPLIFT;
    const spot = m.PRIMARY * m.RUNTIME * m.ON_DEMAND +
                 m.CORE * m.RUNTIME * m.ON_DEMAND * (1 - m.SPOT_DISC) +
                 ih * m.UPLIFT;
    const srv = m.GB_SCANNED * 0.005;
    const forgot = (m.CORE + m.PRIMARY) * 24 * 7 * (m.ON_DEMAND + m.UPLIFT);
    const egress = m.GB_SCANNED * 0.09;
    BDA.state.S.cost = { od, spot, srv, forgot, egress, pct: Math.round((1 - spot / od) * 100) };
  }

  /* ---- helpers ---- */
  function addFiles(list) {
    const S = BDA.state.S;
    list.forEach(f => {
      if (!S.files.some(e => e.path === f.path)) {
        S.files.push(Object.assign({}, f, { isNew: true }));
      }
    });
  }

  function addLocal(list) {
    const S = BDA.state.S;
    list.forEach(f => {
      if (!S.local.some(e => e.name === f.name)) S.local.push(f);
    });
  }

  /* ---- fx table ---- */
  const TABLE = {
    'docker':       S => { S.env.docker = true; },
    'cli':          S => { S.env.cli = true; S.env.region = 'us-east-1'; },
    'minio-up':     S => { S.env.minio = true; },
    'gen-events':   () => addLocal([{ name: '~/lab3/events.json', note: '1.1 GiB' }]),

    'load-raw':     S => {
      S.bucketCreated = true;
      addFiles([{ path: 'raw/events/events.json', size: 1181116000 }]);
    },

    'mk-bootstrap': S => { S.cwd = '~/lab8'; addLocal([{ name: 'bootstrap.sh' }]); },
    'up-bootstrap': () => addFiles([{ path: 'scripts/bootstrap.sh', size: 612 }]),
    'mk-job':       () => addLocal([{ name: 'daily_rollup.py' }]),
    'up-job':       () => addFiles([{ path: 'scripts/daily_rollup.py', size: 948 }]),
    'mk-conf':      () => addLocal([{ name: 's3.conf' }]),

    'run-job':      S => {
      S.runtime = MODEL.RUNTIME;
      addFiles([
        { path: 'curated/daily_rollup/day=2026-10-20/part-0000.parquet', size: 28200000 },
        { path: 'curated/daily_rollup/day=2026-10-21/part-0000.parquet', size: 27850000 },
        { path: 'curated/daily_rollup/day=2026-10-22/part-0000.parquet', size: 28010000 }
      ]);
    },

    'disposable':   S => { S.cluster.proven = true; },
    'cost':         () => { computeCost(); BDA.panels.renderCost(true); },

    'commit':       () => addFiles([
      { path: 'tmp/many/', size: 28000000, count: 200 },
      { path: 'tmp/few/',  size: 28000000, count: 4 }
    ]),

    'mk-emr':       () => addLocal([{ name: 'launch_emr.sh' }]),
    'mk-hdi':       () => addLocal([{ name: 'launch_hdinsight.sh' }]),
    'creds':        S => { S.env.credsRemoved = true; addLocal([{ name: 's3-prod.conf' }]); },

    'clean':        S => { S.files = S.files.filter(f => f.path.indexOf('tmp/') !== 0); },
    'shutdown':     S => { S.env.minio = false; }
  };

  function apply(fx) {
    const fn = TABLE[fx];
    if (fn) fn(BDA.state.S);
    BDA.panels.renderEnv();
    BDA.panels.renderStore(true);
    BDA.panels.renderCluster();
  }

  /* ---- the transient-cluster animation (Step 9) ---- */
  const NOTES = [
    ['Cluster j-2BDA7XYZ requested (emr-7.1.0, 5 × m5.xlarge)', 'b'],
    ['Provisioning instances… STARTING → BOOTSTRAPPING', 'd'],
    ['bootstrap.sh: deps ok 2.2.2 on all 5 nodes', 't'],
    ['[job] read 4000000 rows → wrote 2184 rows to curated/', 'b'],
    ['Step complete · ActionOnFailure respected · auto-terminating', 'a'],
    ['State: TERMINATED · results safe in S3 · instance bill ends', 'g']
  ];

  async function simulateCluster() {
    const S = BDA.state.S;
    const T = BDA.terminal;
    const STAGES = BDA.panels.STAGES;
    const { sleep, esc } = BDA.util;

    if (BDA.runner.isBusy() || S.cluster.active) return;
    BDA.runner.setBusy(true);

    S.cluster = { active: true, terminated: false, stageIndex: 0, proven: S.cluster.proven };
    T.echo('bash launch_emr.sh   # simulated dry-run');
    T.line('<span class="v">▶ simulating transient cluster lifecycle…</span>');
    BDA.panels.renderCluster();
    BDA.panels.renderEnv();

    S.sessionCost = 0;
    const timer = setInterval(() => {
      if (S.cluster.active) {
        S.sessionCost += 0.004;
        BDA.panels.renderEnv();
        BDA.bridge.publish();   // the console windows show the meter too
      }
    }, 120);

    for (let i = 0; i < STAGES.length; i++) {
      S.cluster.stageIndex = i;
      BDA.panels.renderCluster();
      BDA.bridge.publish();
      T.line('<span class="d">[' + STAGES[i].b + ']</span> <span class="' + NOTES[i][1] + '">' +
             esc(NOTES[i][0]) + '</span>');
      await sleep(i === 1 ? 1600 : 1100);
    }

    clearInterval(timer);
    S.cluster.active = false;
    S.cluster.terminated = true;
    S.cluster.stageIndex = STAGES.length;
    BDA.panels.renderCluster();

    T.line('<span class="g">✓ run cost ≈ $' + S.sessionCost.toFixed(2) +
           ' · meter stopped the moment the cluster died</span>');
    await sleep(400);

    S.sessionCost = 0;              // no cluster, no bill
    BDA.panels.renderEnv();
    T.line('<span class="d"># exactly the point: no cluster, no bill. The data outlived the compute.</span>');

    S.done['cmd:sim-cluster'] = true;
    BDA.runner.setBusy(false);
    BDA.state.save();
  }

  return { apply, computeCost, simulateCluster, addFiles, addLocal, MODEL };
})();

/* The step data references this by name in its `action.fn`. */
window.simulateCluster = () => BDA.effects.simulateCluster();

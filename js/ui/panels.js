/* ============================================================
   panels.js — the four read-only views that mirror lab state:
   env chips, the bucket tree, cluster lifecycle, cost meters.
   Each render* function is idempotent: call it any time.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.panels = (function () {
  const { esc, human, pct, replay } = BDA.util;

  /* ---------------- environment chips ---------------- */
  function chip(id, on, label) {
    const e = document.getElementById(id);
    if (!e) return;
    e.className = 'chip' + (on ? ' on' : '');
    e.innerHTML = '<i class="dot"></i>' + label;
  }

  function renderEnv() {
    const S = BDA.state.S;
    chip('chDocker', S.env.docker, 'Docker');
    chip('chMinio', S.env.minio, 'MinIO' + (S.env.minio ? ' · up' : ''));
    chip('chCli', S.env.cli, 'AWS CLI');
    chip('chRegion', !!S.env.region, S.env.region || 'no region');

    const cc = document.getElementById('chCost');
    cc.innerHTML = '<i class="dot"></i>Session $' + S.sessionCost.toFixed(2);
    cc.className = 'chip cost' + (S.cluster.active ? ' run' : '');
  }

  /* ---------------- object storage ---------------- */
  const ZONES = ['raw', 'curated', 'results', 'scripts', 'tmp'];

  function buildTree(files) {
    const tree = {};
    files.forEach(f => {
      const parts = f.path.replace(/\/$/, '').split('/');
      let node = tree;
      parts.forEach((p, i) => {
        const leaf = i === parts.length - 1;
        node[p] = node[p] || { __children: {}, __leaf: leaf, __size: 0, __count: 0 };
        if (leaf) {
          node[p].__leaf = true;
          node[p].__size = f.size;
          node[p].__count = f.count;
          node[p].__isnew = f.isNew;
        }
        node = node[p].__children;
      });
    });
    return tree;
  }

  function treeRows(node, depth) {
    let rows = '';
    const keys = Object.keys(node).sort((a, b) => {
      if (depth !== 0) return a.localeCompare(b);
      const az = ZONES.indexOf(a), bz = ZONES.indexOf(b);
      return (az < 0 ? 99 : az) - (bz < 0 ? 99 : bz);
    });
    keys.forEach(k => {
      const n = node[k];
      const isZone = depth === 0;
      const ind = depth > 0 ? 'ind' + Math.min(depth, 3) : '';
      const icon = n.__leaf ? '\u{1F4C4}' : (isZone ? '\u{1F4C1}' : '\u{1F4C2}');
      let right = '';
      if (n.__leaf) {
        right = n.__count
          ? '<span class="badge">' + n.__count + ' objects</span>'
          : '<span class="sz">' + human(n.__size) + '</span>';
      }
      rows += '<div class="node ' + (isZone ? 'zone' : '') + ' ' + ind + ' ' +
              (n.__isnew ? 'isnew' : '') + '"><span>' + icon + '</span><span class="nm">' +
              esc(k) + (n.__leaf ? '' : '/') + '</span>' + right + '</div>';
      if (!n.__leaf) rows += treeRows(n.__children, depth + 1);
    });
    return rows;
  }

  function localBlock() {
    const S = BDA.state.S;
    const head = '<div class="local-head">Local workspace · ~/lab8</div>';
    if (!S.local.length) return head + '<div class="local-empty">empty</div>';
    return head + '<ul class="local-list">' + S.local.map(f =>
      '<li><span>·</span><span class="f">' +
      esc(f.name.replace('~/lab8/', '').replace('~/', '')) + '</span>' +
      (f.note ? '<span class="n">' + f.note + '</span>' : '') + '</li>').join('') + '</ul>';
  }

  function storeFoot() {
    const S = BDA.state.S;
    const n = S.files.reduce((a, f) => a + (f.count || 1), 0);
    const sz = S.files.reduce((a, f) => a + (f.size || 0), 0);
    document.getElementById('storeCount').textContent = n + ' object' + (n === 1 ? '' : 's');
    document.getElementById('storeSize').textContent = human(sz);
  }

  function renderStore(flash) {
    const S = BDA.state.S;
    const body = document.getElementById('storeBody');
    document.getElementById('storeUrl').textContent =
      S.bucketCreated ? 's3://bda-lake' : '(no bucket)';

    if (!S.files.length && !S.local.length) {
      body.innerHTML = '<div class="empty-note">No objects yet.<br>Run Step 1 to create the bucket.</div>' + localBlock();
      storeFoot();
      return;
    }

    const rows = '<div class="node zone"><span>\u{1FAA3}</span><span class="nm">bda-lake/</span></div>' +
                 treeRows(buildTree(S.files), 0);
    body.innerHTML = '<div class="tree">' + rows + '</div>' + localBlock();

    setTimeout(() => { S.files.forEach(f => { f.isNew = false; }); }, 1800);
    storeFoot();
    if (flash) replay(document.querySelector('.card-head.store'), 'flash');
  }

  /* ---------------- cluster lifecycle ---------------- */
  const STAGES = [
    { b: 'Request',        s: 'create-cluster submitted' },
    { b: 'Provisioning',   s: '~5–8 min · instances boot' },
    { b: 'Bootstrap',      s: 'install deps on every node' },
    { b: 'Step: rollup',   s: 'spark-submit runs the job' },
    { b: 'Auto-terminate', s: 'cluster shuts down' },
    { b: 'Done',           s: 'results in S3 · bill stops' }
  ];

  function renderCluster() {
    const c = BDA.state.S.cluster;
    const body = document.getElementById('clusterBody');
    let cls = '', txt = 'Idle — no cluster running';
    if (c.active) { cls = 'live'; txt = '● CLUSTER RUNNING — billing'; }
    else if (c.terminated) { cls = 'gone'; txt = '✓ Terminated — cost stopped, data safe in S3'; }

    let html = '<div class="cluster-state ' + cls + '">' + txt + '</div><div class="pipe">';
    STAGES.forEach((st, i) => {
      let k = '';
      if (c.stageIndex > i) k = 'done';
      else if (c.stageIndex === i) k = (i === 4 ? 'term' : 'active');
      if (c.terminated && i >= 4) k = 'done';
      html += '<div class="stage ' + k + '"><span class="dot"></span><span class="txt"><b>' +
              st.b + '</b><small>' + st.s + '</small></span></div>';
    });
    body.innerHTML = html + '</div>';
  }

  /* ---------------- cost ---------------- */
  function row(label, v, cls, max) {
    return '<li><div class="cl"><span>' + label + '</span><span class="v">$' + v.toFixed(2) +
           '</span></div><div class="meter ' + cls + '"><i data-w="' + pct(v, max) + '"></i></div></li>';
  }

  function renderCost(animate) {
    const c = BDA.state.S.cost;
    const body = document.getElementById('costBody');
    if (!c) {
      body.innerHTML = '<div class="cost-empty">Run Step 7 to compute<br>the cost of one job.</div>';
      return;
    }
    const max = Math.max(c.od, c.spot, c.srv) * 1.1;
    body.innerHTML =
      '<ul class="cost-rows">' +
      row('EMR on-demand', c.od, 'm-od', max) +
      row('Core on spot <span class="pct">−' + c.pct + '%</span>', c.spot, 'm-spot', max) +
      row('Serverless SQL', c.srv, 'm-srv', max) +
      '</ul>' +
      '<div class="forgot"><div class="cl"><span>⚠ Forgotten 7 days</span><span class="v">$' +
      c.forgot.toFixed(2) + '</span></div><div class="meter"><i></i></div>' +
      '<small>' + Math.round(c.forgot / c.od) +
      '× one run. This is why every cluster gets <code>--auto-terminate</code>.</small></div>' +
      '<div style="margin-top:9px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">' +
      '+ egress to laptop: $' + c.egress.toFixed(2) + ' (keep compute in-region)</div>';

    const fill = () => document.querySelectorAll('.cost-rows .meter>i')
      .forEach(i => { i.style.width = i.dataset.w + '%'; });

    if (animate) {
      requestAnimationFrame(() => requestAnimationFrame(fill));
      replay(document.querySelector('.card-head.cost'), 'flash');
    } else {
      fill();
    }
  }

  /* ---------------- progress ---------------- */
  function renderProgress() {
    const ALL = BDA.data.ALL, S = BDA.state.S;
    const done = ALL.filter(x => S.done[x.id]).length;
    document.getElementById('progTxt').textContent = done + ' / ' + ALL.length;
    document.getElementById('progBar').style.width = (done / ALL.length * 100) + '%';
  }

  return { renderEnv, renderStore, renderCluster, renderCost, renderProgress, STAGES };
})();

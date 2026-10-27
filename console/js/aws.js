/* ============================================================
   aws.js — the AWS Management Console, drawn inside a simulated
   browser window.

   Three services, each on the host and path AWS really uses, so
   the address bar teaches as much as the page does:

     us-east-1.console.aws.amazon.com/console/home?region=us-east-1
     s3.console.aws.amazon.com/s3/buckets?region=us-east-1
     s3.console.aws.amazon.com/s3/buckets/bda-lake?region=us-east-1&tab=objects&prefix=raw/events/
     us-east-1.console.aws.amazon.com/emr/home?region=us-east-1#/clusterDetails/j-1K48XKQ3HCB7Z
     us-east-1.console.aws.amazon.com/costmanagement/home?region=us-east-1#/dashboard

   Everything on screen is the lab's own state: the bucket is the
   bucket the terminal writes to, the cluster is the one Step 6
   starts, the bill is what Step 7 computes.

   Mount it with:
     BDA.apps.aws.mount(rootEl, store)   // -> {chrome, destroy}
   ============================================================ */
window.BDA = window.BDA || {};
BDA.apps = BDA.apps || {};

BDA.apps.aws = (function () {

  const BUCKET = 'bda-lake';
  const CLUSTER_ID = 'j-1K48XKQ3HCB7Z';
  const CREATED = 'October 26, 2026, 09:12:48 (UTC+00:00)';
  const S3_HOST = 's3.console.aws.amazon.com';

  const FAVICON =
    '<svg viewBox="0 0 32 32" width="16" height="16" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="32" height="32" rx="6" fill="#232f3e"/>' +
    '<path d="M6 21.5c5.6 3.2 13.4 3.2 19-.3" stroke="#ff9900" stroke-width="2.2" ' +
    'fill="none" stroke-linecap="round"/>' +
    '<path d="M22.4 20.1c1.4-.5 3-.5 2.6.6-.3.9-1.2 1.9-1.2 1.9" stroke="#ff9900" ' +
    'stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
    '<text x="16" y="15" fill="#fff" font-size="10" font-family="Arial" font-weight="700" ' +
    'text-anchor="middle">aws</text></svg>';

  const LOGO =
    '<svg width="38" height="23" viewBox="0 0 64 40" aria-label="AWS">' +
    '<text x="4" y="21" fill="#fff" font-size="19" font-family="Arial,Helvetica" ' +
    'font-weight="700" letter-spacing="-1">aws</text>' +
    '<path d="M6 29c13 7 32 7 46-1" stroke="#ff9900" stroke-width="3" fill="none" ' +
    'stroke-linecap="round"/>' +
    '<path d="M45 26c4-1.5 8-1 7 1.5-.7 2-3 4-3 4" stroke="#ff9900" stroke-width="2.4" ' +
    'fill="none" stroke-linecap="round"/></svg>';

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function human(b) {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }
  function money(v) { return '$' + (v || 0).toFixed(2); }

  function qsv(path, key) {
    const i = path.indexOf('?');
    if (i === -1) return '';
    const query = path.slice(i + 1).split('#')[0];
    const hit = query.split('&').map(p => p.split('=')).find(p => p[0] === key);
    return hit ? decodeURIComponent(hit[1] || '') : '';
  }
  function base(path) { return path.split('?')[0].split('#')[0]; }
  function hash(path) { const i = path.indexOf('#'); return i === -1 ? '' : path.slice(i + 1); }

  const REGION_NAMES = {
    'us-east-1': 'N. Virginia', 'us-west-2': 'Oregon',
    'eu-west-1': 'Ireland', 'ap-south-1': 'Mumbai'
  };

  /* The cluster's visible status, derived from the lab's stage index. */
  const PHASES = [
    { st: 'Starting',      cls: 'run',  note: 'create-cluster accepted' },
    { st: 'Starting',      cls: 'run',  note: 'Provisioning EC2 instances' },
    { st: 'Bootstrapping', cls: 'run',  note: 'Running bootstrap actions on all nodes' },
    { st: 'Running',       cls: 'run',  note: 'Step: daily_rollup is executing' },
    { st: 'Terminating',   cls: 'warn', note: 'All steps completed — auto-terminating' },
    { st: 'Terminated',    cls: 'ok',   note: 'All steps completed' }
  ];

  /* ============================================================
     One instance per window.
     ============================================================ */
  function mount(root, store) {

    let chrome = null;

    function st() { return store.state(); }
    function region() { return (st().env || {}).region || 'us-east-1'; }
    function regionName() { return REGION_NAMES[region()] || region(); }
    function regHost() { return region() + '.console.aws.amazon.com'; }
    function account() { return (st().env || {}).awsAcct || '4815-1623-4290'; }

    function totals() {
      const files = st().files || [];
      return {
        n: files.reduce((a, f) => a + (f.count || 1), 0),
        size: files.reduce((a, f) => a + (f.size || 0), 0)
      };
    }

    function phase() {
      const c = st().cluster || {};
      if (c.terminated) return PHASES[5];
      if (c.active && c.stageIndex >= 0) return PHASES[Math.min(c.stageIndex, 5)];
      return null;                        // never launched
    }

    /** One level of the bucket, as S3 LIST with delimiter="/" returns it. */
    function listing(prefix) {
      const files = st().files || [];
      const folders = {};
      const objects = [];

      files.forEach(f => {
        const p = f.path;
        if (p.indexOf(prefix) !== 0) return;
        const rest = p.slice(prefix.length);

        if (!rest && f.count) {           // a stand-in for N part files
          for (let i = 0; i < f.count; i++) {
            objects.push({
              name: 'part-' + String(i).padStart(5, '0') + '.snappy.parquet',
              size: Math.round((f.size || 0) / f.count),
              path: p, synthetic: true
            });
          }
          return;
        }
        if (!rest) return;

        const slash = rest.indexOf('/');
        if (slash === -1) {
          objects.push({ name: rest, size: f.size, path: p });
        } else {
          const name = rest.slice(0, slash + 1);
          folders[name] = folders[name] || { name, size: 0, count: 0, path: prefix + name };
          folders[name].size += f.size || 0;
          folders[name].count += f.count || 1;
        }
      });

      return {
        folders: Object.keys(folders).sort().map(k => folders[k]),
        objects: objects.sort((a, b) => a.name.localeCompare(b.name))
      };
    }

    function objUrl(prefix) {
      return '/s3/buckets/' + BUCKET + '?region=' + region() + '&tab=objects' +
             (prefix ? '&prefix=' + encodeURIComponent(prefix) : '');
    }

    /* ---------- shared layout ---------- */

    function topNav() {
      const home = '/console/home?region=' + region();
      return '<div class="aw-nav">' +
        '<div class="logo" data-go="' + home + '">' + LOGO + '</div>' +
        '<div class="svc" data-go="' + home + '">☰ Services</div>' +
        '<div class="search">\u{1F50D} Search [Option+S]</div>' +
        '<div class="right">' +
          '<div class="it">☁ <span class="caret">▾</span></div>' +
          '<div class="it">❓</div>' +
          '<div class="it">' + regionName() + ' <span class="caret">▾</span></div>' +
          '<div class="it">bda-lab · ' + esc(account()) +
          ' <span class="caret">▾</span></div>' +
        '</div></div>';
    }

    function crumbs(trail) {
      return '<div class="aw-crumbs">' + trail.map((x, i) =>
        (i ? '<span class="sep">/</span>' : '') +
        (x.to ? '<a data-go="' + esc(x.to) + '">' + esc(x.label) + '</a>'
              : '<span class="cur">' + esc(x.label) + '</span>')).join('') + '</div>';
    }

    function sideNav(service, active) {
      const SETS = {
        s3: {
          title: '\u{1FAA3} Amazon S3',
          items: [
            { k: 'buckets', t: 'General purpose buckets', to: '/s3/buckets?region=' + region() },
            { k: 'dir', t: 'Directory buckets' },
            { k: 'ap', t: 'Access Points' },
            { k: 'bo', t: 'Batch Operations' },
            { grp: 'Analytics' },
            { k: 'lens', t: 'Storage Lens dashboards' },
            { grp: 'Account settings' },
            { k: 'pab', t: 'Block Public Access' }
          ]
        },
        emr: {
          title: '\u{1F5A5} Amazon EMR',
          items: [
            { grp: 'EMR on EC2' },
            { k: 'clusters', t: 'Clusters', to: '/emr/home?region=' + region() + '#/clusterList' },
            { k: 'notebooks', t: 'Notebooks' },
            { k: 'sec', t: 'Security configurations' },
            { grp: 'EMR Serverless' },
            { k: 'apps', t: 'Applications' },
            { grp: 'EMR on EKS' },
            { k: 'vc', t: 'Virtual clusters' }
          ]
        },
        cost: {
          title: '\u{1F4B3} Billing and Cost Management',
          items: [
            { k: 'home', t: 'Home', to: '/costmanagement/home?region=' + region() + '#/dashboard' },
            { grp: 'Cost analysis' },
            { k: 'explorer', t: 'Cost Explorer' },
            { k: 'budgets', t: 'Budgets' },
            { k: 'anomaly', t: 'Cost Anomaly Detection' },
            { grp: 'Billing' },
            { k: 'bills', t: 'Bills' },
            { k: 'pay', t: 'Payments' }
          ]
        }
      };
      const set = SETS[service];
      if (!set) return '';
      return '<nav class="aw-side"><h3>' + set.title + '</h3><ul>' +
        set.items.map(i => i.grp
          ? '<li class="grp" style="cursor:default">' + i.grp + '</li>'
          : '<li class="' + (i.k === active ? 'on' : '') + '"' +
            (i.to ? ' data-go="' + esc(i.to) + '"' : '') + '>' + i.t + '</li>'
        ).join('') + '</ul></nav>';
    }

    function page(opts) {
      return '<div class="aw">' + topNav() + crumbs(opts.trail) +
        '<div class="aw-main">' + sideNav(opts.service, opts.active) +
          '<div class="aw-content">' + opts.body + '</div></div>' +
        '<div class="aw-foot"><span>© 2026, Amazon Web Services, Inc.</span>' +
          '<span>Privacy</span><span>Terms</span>' +
          '<span style="margin-left:auto">Simulated console — no AWS account is contacted.' +
          '</span></div></div>';
    }

    function kv(k, v, mono) {
      return '<div><div class="k">' + k + '</div><div class="v' + (mono ? ' mono' : '') + '">' +
        esc(v) + '</div></div>';
    }

    /* ---------- views ---------- */

    function homeView() {
      const t = totals();
      const ph = phase();
      const s = st();
      return page({
        service: null,
        trail: [{ label: 'Console Home' }],
        body:
          '<div class="aw-head"><div><h1>Console Home</h1>' +
            '<div class="sub">Account <strong>' + esc(account()) + '</strong> · ' +
            regionName() + ' (' + region() + ')</div></div></div>' +
          '<div class="aw-alert info"><span class="ic">ℹ</span><div>' +
            '<b>This console mirrors your lab.</b> The bucket, the cluster and the bill below are ' +
            'the same state your terminal is driving — run a step behind this window and ' +
            'watch them move.</div></div>' +
          '<div class="aw-tiles">' +
            '<div class="aw-tile" data-go="/s3/buckets?region=' + region() + '">' +
              '<div class="ic">\u{1FAA3}</div><h4>S3</h4><p>' +
              (s.bucketCreated ? '1 bucket · ' + t.n + ' objects · ' + human(t.size)
                               : 'No buckets yet') + '</p></div>' +
            '<div class="aw-tile" data-go="/emr/home?region=' + region() + '#/clusterList">' +
              '<div class="ic">\u{1F5A5}</div><h4>EMR</h4><p>' +
              (ph ? '1 cluster · ' + ph.st : 'No clusters') + '</p></div>' +
            '<div class="aw-tile" data-go="/costmanagement/home?region=' + region() +
              '#/dashboard"><div class="ic">\u{1F4B3}</div><h4>Billing and Cost Management</h4>' +
              '<p>' + (s.cost ? 'Month-to-date ' + money(s.cost.od)
                              : 'No charges computed yet') + '</p></div>' +
          '</div>'
      });
    }

    function bucketsView() {
      const s = st();
      const t = totals();
      const body = s.bucketCreated
        ? '<div class="aw-box"><div class="aw-box-head"><h2>General purpose buckets ' +
            '<span class="n">(1)</span></h2><div class="acts">' +
            '<button class="aw-btn plain sm" data-refresh>↻</button>' +
            '<button class="aw-btn sm">Copy ARN</button>' +
            '<button class="aw-btn primary sm">Create bucket</button></div></div>' +
          '<div class="aw-box-body flush"><table class="aw-tbl"><thead><tr>' +
            '<th style="width:40px"></th><th>Name</th><th>AWS Region</th>' +
            '<th>Objects</th><th class="num">Size</th><th>Creation date</th></tr></thead>' +
            '<tbody><tr><td><input type="checkbox" class="aw-ck"></td>' +
            '<td><a data-go="' + objUrl('') + '">' + BUCKET + '</a></td>' +
            '<td>' + regionName() + ' (' + region() + ')</td>' +
            '<td>' + t.n + '</td><td class="num">' + human(t.size) + '</td>' +
            '<td>' + CREATED + '</td></tr></tbody></table></div></div>'
        : '<div class="aw-box"><div class="aw-box-head"><h2>General purpose buckets ' +
            '<span class="n">(0)</span></h2></div><div class="aw-box-body">' +
            '<div class="aw-empty"><div class="ic">\u{1FAA3}</div><h3>No buckets</h3>' +
            '<p>Run <strong>Step 1</strong> in the lab (<code>s3 mb s3://bda-lake</code>) ' +
            'and refresh this page.</p>' +
            '<button class="aw-btn primary" data-refresh>Refresh</button></div></div></div>';

      return page({
        service: 's3', active: 'buckets',
        trail: [{ label: 'Amazon S3', to: '/s3/buckets?region=' + region() }, { label: 'Buckets' }],
        body:
          '<div class="aw-head"><div><h1>Amazon S3</h1>' +
            '<div class="sub">Object storage built to store and retrieve any amount of data from ' +
            'anywhere. S3 is regional, not attached to any one compute cluster.</div></div></div>' +
          body
      });
    }

    function objectsView(prefix) {
      const list = listing(prefix);
      const folders = list.folders, objects = list.objects;
      const t = totals();

      const trail = [
        { label: 'Amazon S3', to: '/s3/buckets?region=' + region() },
        { label: 'Buckets', to: '/s3/buckets?region=' + region() },
        { label: BUCKET, to: objUrl('') }
      ];
      let acc = '';
      const parts = prefix ? prefix.replace(/\/$/, '').split('/') : [];
      parts.forEach(p => { acc += p + '/'; trail.push({ label: p, to: objUrl(acc) }); });
      delete trail[trail.length - 1].to;

      let rows = '';
      folders.forEach(f => {
        rows += '<tr><td><input type="checkbox" class="aw-ck"></td>' +
          '<td>\u{1F4C1} <a data-go="' + esc(objUrl(f.path)) + '">' + esc(f.name) + '</a></td>' +
          '<td>Folder</td><td class="num">—</td>' +
          '<td class="num">' + human(f.size) + '</td>' +
          '<td><span class="aw-st ok">' + f.count + ' object' + (f.count === 1 ? '' : 's') +
          '</span></td></tr>';
      });
      objects.forEach(o => {
        const ext = (o.name.split('.').pop() || '').toLowerCase();
        rows += '<tr><td><input type="checkbox" class="aw-ck"></td>' +
          '<td>\u{1F4C4} <span class="mono">' + esc(o.name) + '</span></td>' +
          '<td>' + esc(ext) + '</td><td class="num">Standard</td>' +
          '<td class="num">' + human(o.size) + '</td>' +
          '<td>' + (o.synthetic ? '' :
            '<button class="aw-btn plain sm" data-rm="' + esc(o.path) + '">Delete</button>') +
          '</td></tr>';
      });

      const table = rows
        ? '<table class="aw-tbl"><thead><tr><th style="width:40px"></th><th>Name</th>' +
          '<th>Type</th><th class="num">Storage class</th><th class="num">Size</th><th></th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="aw-empty"><div class="ic">\u{1F4C2}</div><h3>No objects</h3>' +
          '<p>This prefix is empty. Run the next lab step and refresh.</p>' +
          '<button class="aw-btn primary" data-refresh>Refresh</button></div>';

      const alert = prefix === 'tmp/many/'
        ? '<div class="aw-alert warn"><span class="ic">⚠</span><div>' +
          '<b>Small-file problem.</b> 200 part files for 28 MB of data. Every one is a separate ' +
          'GET on read, and the listing alone costs you time. <code>tmp/few/</code> holds the ' +
          'same bytes in 4 files — compare them.</div></div>'
        : '<div class="aw-alert info"><span class="ic">ℹ</span><div>' +
          'This is the same bucket the MinIO console shows and the terminal writes to. One object ' +
          'store, two front ends — that is the point of the S3 API.</div></div>';

      return page({
        service: 's3', active: 'buckets', trail: trail,
        body:
          '<div class="aw-head"><div><h1>' + BUCKET + '</h1>' +
            '<div class="sub">s3://' + BUCKET + '/' + esc(prefix) + ' · ' +
            t.n + ' objects · ' + human(t.size) + '</div></div>' +
            '<div class="acts"><button class="aw-btn plain" data-refresh>↻ Refresh</button>' +
            '<button class="aw-btn">Copy S3 URI</button>' +
            '<button class="aw-btn primary">Upload</button></div></div>' +
          '<div class="aw-tabs"><button class="on">Objects</button><button>Properties</button>' +
            '<button>Permissions</button><button>Metrics</button><button>Management</button>' +
            '<button>Access Points</button></div>' + alert +
          '<div class="aw-box"><div class="aw-box-head"><h2>Objects <span class="n">(' +
            (folders.length + objects.length) + ')</span></h2></div>' +
            '<div class="aw-box-body flush">' + table + '</div></div>'
      });
    }

    function clusterListView() {
      const ph = phase();
      const body = ph
        ? '<div class="aw-box"><div class="aw-box-head"><h2>Clusters <span class="n">(1)</span>' +
            '</h2><div class="acts">' +
            '<button class="aw-btn plain sm" data-refresh>↻</button>' +
            '<button class="aw-btn primary sm">Create cluster</button></div></div>' +
          '<div class="aw-box-body flush"><table class="aw-tbl"><thead><tr>' +
            '<th>Cluster name</th><th>ID</th><th>Status</th><th>Created</th>' +
            '<th class="num">Elapsed</th></tr></thead><tbody><tr>' +
            '<td><a data-go="/emr/home?region=' + region() + '#/clusterDetails/' + CLUSTER_ID +
            '">bda-daily-rollup</a></td>' +
            '<td class="mono">' + CLUSTER_ID + '</td>' +
            '<td><span class="aw-st ' + ph.cls + '">' + ph.st + '</span></td>' +
            '<td>' + CREATED + '</td><td class="num">45 minutes</td>' +
            '</tr></tbody></table></div></div>'
        : '<div class="aw-box"><div class="aw-box-head"><h2>Clusters <span class="n">(0)</span>' +
          '</h2></div><div class="aw-box-body"><div class="aw-empty"><div class="ic">\u{1F5A5}' +
          '</div><h3>No clusters</h3><p>Run <strong>Step 6</strong> in the lab to launch the ' +
          'transient cluster, then refresh.</p>' +
          '<button class="aw-btn primary" data-refresh>Refresh</button></div></div></div>';

      return page({
        service: 'emr', active: 'clusters',
        trail: [{ label: 'EMR', to: '/emr/home?region=' + region() + '#/clusterList' },
                { label: 'Clusters' }],
        body:
          '<div class="aw-head"><div><h1>Clusters</h1>' +
            '<div class="sub">EMR clusters are compute. They come up, run steps, and go away ' +
            '— your data stays in S3 either way.</div></div></div>' + body
      });
    }

    function clusterDetailView() {
      const ph = phase();
      if (!ph) return clusterListView();
      const c = st().cluster || {};
      const cost = st().cost;

      const steps = [
        { n: 'Setup hadoop debugging',
          s: (c.stageIndex >= 2 || c.terminated) ? 'Completed' : 'Pending' },
        { n: 'daily_rollup (spark-submit)',
          s: c.terminated ? 'Completed'
            : c.stageIndex >= 4 ? 'Completed'
            : c.stageIndex === 3 ? 'Running' : 'Pending' }
      ];

      const banner = c.terminated
        ? '<div class="aw-alert good"><span class="ic">✓</span><div>' +
          '<b>Cluster terminated.</b> Billing stopped at ' +
          (cost ? money(cost.spot) : 'the end of the run') +
          '. The output is still in <code>s3://' + BUCKET + '/curated/</code> — that ' +
          'separation is the whole reason the data does not live on the cluster.</div></div>'
        : c.active
          ? '<div class="aw-alert warn"><span class="ic">●</span><div>' +
            '<b>This cluster is billing right now.</b> ' + ph.note +
            '. Five m5.xlarge instances at $0.214/hr plus the EMR uplift.</div></div>'
          : '';

      return page({
        service: 'emr', active: 'clusters',
        trail: [{ label: 'EMR', to: '/emr/home?region=' + region() + '#/clusterList' },
                { label: 'Clusters', to: '/emr/home?region=' + region() + '#/clusterList' },
                { label: 'bda-daily-rollup' }],
        body:
          '<div class="aw-head"><div><h1>bda-daily-rollup</h1>' +
            '<div class="sub"><span class="aw-st ' + ph.cls + '">' + ph.st + '</span> · ' +
            ph.note + '</div></div>' +
            '<div class="acts"><button class="aw-btn plain" data-refresh>↻ Refresh</button>' +
            '<button class="aw-btn" data-clone>Clone</button>' +
            '<button class="aw-btn" data-terminate ' + (c.terminated ? 'disabled' : '') + '>' +
            'Terminate</button></div></div>' + banner +
          '<div class="aw-box"><div class="aw-box-head"><h2>Summary</h2></div>' +
            '<div class="aw-box-body"><div class="aw-kv">' +
              kv('Cluster ID', CLUSTER_ID, true) +
              kv('Release label', 'emr-7.3.0') +
              kv('Applications', 'Spark 3.5.1, Hadoop 3.3.6') +
              kv('Termination protection', 'Off') +
              kv('Auto-terminate', 'Yes — after last step') +
              kv('Log URI', 's3://' + BUCKET + '/logs/', true) +
              kv('Primary node', '1 × m5.xlarge') +
              kv('Core nodes', '4 × m5.xlarge' + (c.terminated ? ' (released)' : '')) +
            '</div></div></div>' +
          '<div class="aw-box"><div class="aw-box-head"><h2>Steps <span class="n">(' +
            steps.length + ')</span></h2></div><div class="aw-box-body flush">' +
            '<table class="aw-tbl"><thead><tr><th>Name</th><th>Status</th>' +
            '<th>Action on failure</th></tr></thead><tbody>' +
            steps.map(x => '<tr><td>' + x.n + '</td><td><span class="aw-st ' +
              (x.s === 'Completed' ? 'ok' : x.s === 'Running' ? 'run' : '') + '">' + x.s +
              '</span></td><td>Terminate cluster</td></tr>').join('') +
            '</tbody></table></div></div>' +
          '<div class="aw-box"><div class="aw-box-head"><h2>Bootstrap actions</h2></div>' +
            '<div class="aw-box-body flush"><table class="aw-tbl"><thead><tr><th>Name</th>' +
            '<th>Script location</th></tr></thead><tbody><tr><td>install-deps</td>' +
            '<td class="mono">s3://' + BUCKET + '/scripts/bootstrap.sh</td></tr></tbody>' +
            '</table></div></div>'
      });
    }

    function bars(c) {
      const max = Math.max(c.od, c.spot, c.srv, c.egress) * 1.1;
      const row = (label, v, cls, note) =>
        '<li><div class="cl"><span>' + label + '</span><span class="v">' + money(v) +
        '</span></div><div class="bar ' + cls + '"><i style="width:' +
        Math.max(2, Math.round(v / max * 100)) + '%"></i></div>' +
        (note ? '<div class="note">' + note + '</div>' : '') + '</li>';

      return '<ul class="aw-cost">' +
        row('EMR, all on-demand', c.od, '', '5 × m5.xlarge for 45 min, incl. EMR uplift') +
        row('EMR, core fleet on spot', c.spot, 'spot', '−' + c.pct + '% for the same work') +
        row('Serverless equivalent (20 GB scanned)', c.srv, 'srv',
            'No cluster to forget about, but you pay per byte read') +
        row('Egress if you pull the results out', c.egress, 'bad',
            '20 GB at $0.09/GB — reads inside the region are free') +
        '</ul>';
    }

    function costView() {
      const c = st().cost;
      const body = c
        ? '<div class="aw-box"><div class="aw-box-head"><h2>Cost of one daily_rollup run</h2>' +
            '<div class="acts"><button class="aw-btn plain sm" data-refresh>↻</button>' +
            '</div></div><div class="aw-box-body">' + bars(c) + '</div></div>' +
          '<div class="aw-alert good"><span class="ic">✓</span><div>' +
            '<b>Spot instances on the core fleet cut this run by ' + c.pct + '%</b> — ' +
            money(c.od) + ' becomes ' + money(c.spot) + '. The primary node stays on-demand so ' +
            'losing it does not kill the job.</div></div>' +
          '<div class="aw-alert bad"><span class="ic">⚠</span><div>' +
            '<b>Leaving it running for a week costs ' + money(c.forgot) + '.</b> That is ' +
            Math.round(c.forgot / c.spot) + '× the job itself, for a cluster doing nothing. ' +
            'Auto-terminate is not a nicety.</div></div>'
        : '<div class="aw-box"><div class="aw-box-head"><h2>Cost and usage</h2></div>' +
          '<div class="aw-box-body"><div class="aw-empty"><div class="ic">\u{1F4B3}</div>' +
          '<h3>No cost data yet</h3><p>Run <strong>Step 7</strong> in the lab to work out what ' +
          'one run costs, then refresh.</p>' +
          '<button class="aw-btn primary" data-refresh>Refresh</button></div></div></div>';

      return page({
        service: 'cost', active: 'home',
        trail: [{ label: 'Billing and Cost Management',
                  to: '/costmanagement/home?region=' + region() + '#/dashboard' },
                { label: 'Home' }],
        body:
          '<div class="aw-head"><div><h1>Billing and Cost Management</h1>' +
            '<div class="sub">Account ' + esc(account()) + ' · the figures below are the ' +
            'lab’s own model, not a real bill.</div></div></div>' + body
      });
    }

    /* ---------- router ---------- */

    function render(path) {
      const b = base(path);
      let html, title;

      if (b.indexOf('/s3/buckets/') === 0) {
        html = objectsView(qsv(path, 'prefix'));
        title = BUCKET + ' - S3 bucket';
      } else if (b.indexOf('/s3/buckets') === 0) {
        html = bucketsView();
        title = 'S3 Management Console';
      } else if (b.indexOf('/emr/') === 0) {
        if (hash(path).indexOf('/clusterDetails/') === 0) {
          html = clusterDetailView();
          title = 'bda-daily-rollup - EMR';
        } else {
          html = clusterListView();
          title = 'Clusters - EMR';
        }
      } else if (b.indexOf('/costmanagement/') === 0) {
        html = costView();
        title = 'Billing and Cost Management';
      } else {
        html = homeView();
        title = 'AWS Management Console';
      }

      chrome.setOrigin(b.indexOf('/s3/') === 0 ? S3_HOST : regHost());
      chrome.setTitle(title);
      chrome.view.innerHTML = html;
      wire();
    }

    /* ---------- events ---------- */

    function wire() {
      const view = chrome.view;

      view.querySelectorAll('[data-go]').forEach(n => {
        n.onclick = () => chrome.go(n.dataset.go);
      });
      view.querySelectorAll('[data-refresh]').forEach(n => {
        n.onclick = () => { store.refresh(); chrome.reload(); };
      });
      view.querySelectorAll('[data-rm]').forEach(n => {
        n.onclick = () => {
          const p = n.dataset.rm;
          if (!confirm('Delete ' + p + ' from ' + BUCKET +
                       '?\n\nThis removes it from the lab bucket too.')) return;
          store.send('minio:rm', { path: p });
          setTimeout(() => chrome.repaint(), 120);
        };
      });

      const term = view.querySelector('[data-terminate]');
      if (term) term.onclick = () => {
        store.send('term', {
          text: '# AWS console: Terminate requested — the equivalent is ' +
                'aws emr terminate-clusters --cluster-ids ' + CLUSTER_ID
        });
        alert('In the lab, the cluster auto-terminates after its last step.\n\n' +
              'The command this button maps to has been printed in your lab terminal:\n' +
              '  aws emr terminate-clusters --cluster-ids ' + CLUSTER_ID);
      };

      const clone = view.querySelector('[data-clone]');
      if (clone) clone.onclick = () => {
        store.send('term', {
          text: '# AWS console: Clone — the script in Step 10 (launch_emr.sh) does this ' +
                'reproducibly, which is why it beats clicking.'
        });
      };
    }

    /* ---------- boot this instance ---------- */

    chrome = BrowserChrome.create(root, {
      favicon: FAVICON,
      title: 'AWS Management Console',
      origin: regHost(),
      secure: true,
      start: '/console/home?region=' + region(),
      render: render,
      onClose: function () { if (store.close) store.close(); }
    });
    chrome.start();

    store.send('aws:seen', {});

    // Repaint when anything the console shows actually moves.
    let lastKey = '';
    const off = store.onChange(function (s) {
      const c = s.cluster || {};
      const key = JSON.stringify([
        s.bucketCreated, c.active, c.stageIndex, c.terminated,
        s.cost && s.cost.od,
        (s.files || []).map(f => f.path + ':' + f.size + ':' + (f.count || 1))
      ]);
      if (key === lastKey) return;
      lastKey = key;
      chrome.repaint();
    });

    return { chrome: chrome, destroy: function () { if (off) off(); } };
  }

  return { mount: mount, FAVICON: FAVICON };
})();

/* ============================================================
   minio.js — the MinIO Console, drawn inside a simulated
   browser window.

   Routes follow the real console, including the way it
   base64-encodes the object prefix into the path:

     /login
     /browser
     /browser/bda-lake
     /browser/bda-lake/<base64("raw/events/")>

   Everything it lists comes from the lab's own bucket, so
   running `s3 cp` in the terminal makes a row appear here, and
   deleting a row here removes the object there.

   Mount it with:
     BDA.apps.minio.mount(rootEl, store)   // -> {chrome, destroy}
   where `store` provides state(), send(), onChange(), refresh().
   ============================================================ */
window.BDA = window.BDA || {};
BDA.apps = BDA.apps || {};

BDA.apps.minio = (function () {

  const BUCKET = 'bda-lake';
  const CREATED = '2026-10-26 09:12:48';

  const FAVICON =
    '<svg viewBox="0 0 32 32" width="16" height="16" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="32" height="32" rx="6" fill="#c72e49"/>' +
    '<path d="M8 23V11l5.2 6.4L18.4 11v12" stroke="#fff" stroke-width="2.6" fill="none" ' +
    'stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="24" cy="21.4" r="1.9" fill="#fff"/></svg>';

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function human(b) {
    if (!b) return '0 B';
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  function b64(s) { try { return btoa(s).replace(/=+$/, ''); } catch (e) { return s; } }
  function unb64(s) {
    try { return atob(s + '==='.slice((s.length + 3) % 4)); } catch (e) { return ''; }
  }

  /* ============================================================
     One instance per window.
     ============================================================ */
  function mount(root, store) {

    let signedIn = false;
    let chrome = null;

    function st() { return store.state(); }

    function totals() {
      const files = st().files || [];
      return {
        n: files.reduce((a, f) => a + (f.count || 1), 0),
        size: files.reduce((a, f) => a + (f.size || 0), 0)
      };
    }

    /** One level of the bucket, as S3 LIST with a delimiter returns it. */
    function listing(prefix) {
      const files = st().files || [];
      const folders = {};
      const objects = [];

      files.forEach(f => {
        const p = f.path;
        if (p.indexOf(prefix) !== 0) return;
        const rest = p.slice(prefix.length);

        // A "directory object" standing in for N parts (tmp/many/).
        if (!rest && f.count) {
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

    /* ---------- chrome parts ---------- */

    function sidebar(active) {
      const items = [
        { k: 'browser', i: '\u{1F5C2}', t: 'Object Browser' },
        { k: 'keys',    i: '\u{1F511}', t: 'Access Keys' },
        { k: 'docs',    i: '\u{1F4D8}', t: 'Documentation' },
        { k: 'license', i: '⚖️', t: 'License' }
      ];
      return '<aside class="mn-side">' +
        '<div class="mn-logo">' +
          '<svg width="26" height="26" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" ' +
          'fill="#c72e49"/><path d="M8 23V11l5.2 6.4L18.4 11v12" stroke="#fff" stroke-width="2.6" ' +
          'fill="none" stroke-linejoin="round" stroke-linecap="round"/>' +
          '<circle cx="24" cy="21.4" r="1.9" fill="#fff"/></svg>' +
          '<span class="txt">MinIO<small>Object Store</small></span>' +
        '</div><ul class="mn-nav">' +
          items.map(x => '<li class="' + (x.k === active ? 'on' : '') + '" data-nav="' + x.k + '">' +
            '<span class="i">' + x.i + '</span>' + x.t + '</li>').join('') +
        '</ul><div class="mn-side-foot"><b>minioadmin</b>RELEASE.2026-09-18T04-12-33Z</div></aside>';
    }

    function crumb(trail, withActions) {
      const bits = trail.map((x, i) =>
        (i ? '<span class="sep">/</span>' : '') +
        (x.cur ? '<span class="cur">' + esc(x.label) + '</span>'
               : '<a data-to="' + esc(x.to) + '">' + esc(x.label) + '</a>')).join('');
      const acts = withActions
        ? '<div class="acts"><button class="mn-btn ghost" data-refresh>↻ Refresh</button>' +
          '<button class="mn-btn primary" data-upload>↑ Upload</button></div>'
        : '';
      return '<div class="mn-crumb">' + bits + acts + '</div>';
    }

    function shell(nav, crumbHtml, bodyHtml) {
      const heading = nav === 'browser' ? 'Object Browser'
        : nav === 'keys' ? 'Access Keys'
        : nav === 'docs' ? 'Documentation' : 'License';
      return '<div class="mn">' + sidebar(nav) +
        '<div class="mn-main"><div class="mn-top"><h1>' + heading + '</h1>' +
          '<div class="who"><span>minioadmin</span><span class="av">MA</span></div></div>' +
          crumbHtml + '<div class="mn-body">' + bodyHtml + '</div></div></div>';
    }

    /* ---------- views ---------- */

    function errorPage() {
      return '<div class="cr-error">' +
        '<div class="sadface">:-(</div>' +
        '<h1>This site can’t be reached</h1>' +
        '<p><strong>localhost</strong> refused to connect.</p><p>Try:</p>' +
        '<ul><li>Checking the connection</li><li>Checking the proxy and the firewall</li></ul>' +
        '<button class="reload" data-reload>Reload</button>' +
        '<div class="code">ERR_CONNECTION_REFUSED<br><br>' +
        'The MinIO container is not running. Go back to the lab and run ' +
        '<strong>Step 1 — Start MinIO</strong>, then reload this page.</div></div>';
    }

    function loginPage() {
      return '<div class="mn-login-page"><div class="mn-login">' +
        '<div class="mark"><svg width="46" height="46" viewBox="0 0 32 32">' +
        '<rect width="32" height="32" rx="7" fill="#c72e49"/>' +
        '<path d="M8 23V11l5.2 6.4L18.4 11v12" stroke="#fff" stroke-width="2.6" fill="none" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="24" cy="21.4" r="1.9" fill="#fff"/></svg></div>' +
        '<h2>MinIO</h2><div class="tag">Multi-Cloud Object Storage</div>' +
        '<div class="mn-err" data-err>Invalid Login. Please try again.</div>' +
        '<div class="mn-field"><label>Username</label>' +
          '<input data-user autocomplete="off" spellcheck="false" placeholder="Username"></div>' +
        '<div class="mn-field"><label>Password</label>' +
          '<input data-pass type="password" placeholder="Password"></div>' +
        '<button class="go" data-go>Login</button>' +
        '<div class="mn-hint">Lab credentials: <code>minioadmin</code> / ' +
        '<code>minioadmin</code></div></div></div>';
    }

    function bucketListPage() {
      const t = totals();
      if (!st().bucketCreated) {
        return shell('browser', crumb([{ label: 'Object Browser', cur: true }]),
          '<div class="mn-empty"><div class="ic">\u{1FAA3}</div><h3>No buckets yet</h3>' +
          '<p>Run <strong>Step 1</strong> in the lab (<code>s3 mb s3://bda-lake</code>) ' +
          'and this page will fill in.</p></div>');
      }
      return shell('browser', crumb([{ label: 'Object Browser', cur: true }]),
        '<div class="mn-bucket" data-open><div><div class="nm">' + BUCKET + '</div>' +
        '<div class="meta">Created ' + CREATED + '</div></div>' +
        '<div class="right"><span class="pill">R/W</span><div class="cnt">' +
        t.n + ' objects · ' + human(t.size) + '</div></div></div>');
    }

    function objectsPage(prefix) {
      const list = listing(prefix);
      const folders = list.folders, objects = list.objects;
      const t = totals();

      const trail = [
        { label: 'Object Browser', to: '/browser' },
        { label: BUCKET, to: '/browser/' + BUCKET }
      ];
      let acc = '';
      const parts = prefix ? prefix.replace(/\/$/, '').split('/') : [];
      parts.forEach(p => {
        acc += p + '/';
        trail.push({ label: p, to: '/browser/' + BUCKET + '/' + b64(acc) });
      });
      trail[trail.length - 1].cur = true;

      let rows = '';
      folders.forEach(f => {
        rows += '<tr><td style="width:34px"><input type="checkbox" class="mn-check"></td>' +
          '<td class="nm"><span>\u{1F4C1}</span>' +
          '<a data-prefix="' + esc(f.path) + '">' + esc(f.name) + '</a></td>' +
          '<td class="num">—</td><td class="num">' + human(f.size) + '</td>' +
          '<td class="act"><button class="mn-icon" data-rm="' + esc(f.path) +
          '" title="Delete">\u{1F5D1}</button></td></tr>';
      });
      objects.forEach(o => {
        rows += '<tr><td style="width:34px"><input type="checkbox" class="mn-check"></td>' +
          '<td class="nm"><span>\u{1F4C4}</span><span class="leaf">' + esc(o.name) + '</span></td>' +
          '<td class="num">' + CREATED + '</td><td class="num">' + human(o.size) + '</td>' +
          '<td class="act">' + (o.synthetic ? '' :
            '<button class="mn-icon" data-rm="' + esc(o.path) + '" title="Delete">\u{1F5D1}</button>') +
          '</td></tr>';
      });

      const table = rows
        ? '<table class="mn-table"><thead><tr><th style="width:34px"></th><th>Name</th>' +
          '<th style="text-align:right">Last Modified</th><th style="text-align:right">Size</th>' +
          '<th style="width:60px"></th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="mn-empty"><div class="ic">\u{1F4C2}</div><h3>This location is empty</h3>' +
          '<p>Upload an object, or run the next lab step.</p></div>';

      const stats = prefix ? '' :
        '<div class="mn-stats">' +
          '<div class="mn-stat"><div class="k">Objects</div><div class="v">' + t.n + '</div></div>' +
          '<div class="mn-stat"><div class="k">Size</div><div class="v">' + human(t.size) +
          '</div></div>' +
          '<div class="mn-stat live"><div class="k">Server</div><div class="v">Online</div></div>' +
        '</div>';

      const note = '<div class="mn-note">This is the same bucket the terminal writes to. ' +
        'Run a step in the lab and watch a row appear — or delete one here and watch it ' +
        'vanish from the lab panel.</div>';

      return shell('browser', crumb(trail, true), stats + note + table);
    }

    function keysPage() {
      return shell('keys', crumb([{ label: 'Access Keys', cur: true }]),
        '<table class="mn-table"><thead><tr><th>Access Key</th><th>Expiry</th><th>Status</th>' +
        '</tr></thead><tbody><tr><td class="nm"><span class="leaf">minioadmin</span></td>' +
        '<td>no expiry</td><td><span style="background:#e9f7f0;color:#1d8a5e;padding:3px 9px;' +
        'border-radius:3px;font-size:11px;font-weight:600">Enabled</span></td></tr></tbody></table>' +
        '<div class="mn-note" style="margin:16px 0 0">These are the root credentials the ' +
        'container was started with (<code>MINIO_ROOT_USER</code>). Step 11 of the lab is about ' +
        'getting keys like these off disk entirely.</div>');
    }

    function simplePage(nav, title, body) {
      return shell(nav, crumb([{ label: title, cur: true }]),
        '<div class="mn-note">' + body + '</div>');
    }

    /* ---------- router ---------- */

    function render(path) {
      const s = st();

      // The server is a container. If it is not running, the browser
      // never reaches a page at all.
      if (!s.env || !s.env.minio) {
        chrome.view.innerHTML = errorPage();
        chrome.setTitle('localhost:9001');
        wireError();
        return;
      }

      if (!signedIn) {
        chrome.view.innerHTML = loginPage();
        chrome.setTitle('MinIO Console');
        wireLogin();
        return;
      }

      chrome.setTitle('Object Browser · MinIO Console');

      if (path.indexOf('/browser/' + BUCKET) === 0) {
        const tail = path.slice(('/browser/' + BUCKET).length).replace(/^\//, '');
        chrome.view.innerHTML = objectsPage(tail ? unb64(tail) : '');
      } else if (path === '/access-keys') {
        chrome.view.innerHTML = keysPage();
      } else if (path === '/documentation') {
        chrome.view.innerHTML = simplePage('docs', 'Documentation',
          'In the real console this links out to min.io/docs. The commands you need for this lab ' +
          'are already written in the step panel behind this window.');
      } else if (path === '/license') {
        chrome.view.innerHTML = simplePage('license', 'License',
          'MinIO Community Edition, GNU AGPL v3. Since May 2025 the full management UI ships only ' +
          'with the commercial AIStor build — Community keeps the object browser you are ' +
          'looking at.');
      } else {
        chrome.view.innerHTML = bucketListPage();
      }
      wirePage();
    }

    /* ---------- events ---------- */

    function q(sel) { return chrome.view.querySelector(sel); }
    function qa(sel) { return chrome.view.querySelectorAll(sel); }

    function wireError() {
      q('[data-reload]').onclick = () => { store.refresh(); chrome.reload(); };
    }

    function wireLogin() {
      const u = q('[data-user]'), p = q('[data-pass]');
      const attempt = () => {
        if (u.value.trim() !== 'minioadmin' || p.value !== 'minioadmin') {
          q('[data-err]').classList.add('show');
          p.value = '';
          p.focus();
          return;
        }
        signedIn = true;
        store.send('minio:login', {});
        chrome.go('/browser/' + BUCKET);
      };
      q('[data-go]').onclick = attempt;
      [u, p].forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); }));
      u.focus();
    }

    function wirePage() {
      qa('[data-nav]').forEach(li => {
        li.onclick = () => {
          const k = li.dataset.nav;
          chrome.go(k === 'browser' ? '/browser/' + BUCKET
            : k === 'keys' ? '/access-keys'
            : k === 'docs' ? '/documentation' : '/license');
        };
      });
      qa('[data-to]').forEach(a => { a.onclick = () => chrome.go(a.dataset.to); });
      qa('[data-open]').forEach(c => { c.onclick = () => chrome.go('/browser/' + BUCKET); });
      qa('[data-prefix]').forEach(a => {
        a.onclick = () => chrome.go('/browser/' + BUCKET + '/' + b64(a.dataset.prefix));
      });

      qa('[data-rm]').forEach(b => {
        b.onclick = () => {
          const p = b.dataset.rm;
          if (!confirm('Delete ' + p + ' from ' + BUCKET +
                       '?\n\nThis removes it from the lab bucket too.')) return;
          store.send('minio:rm', { path: p });
          setTimeout(() => chrome.repaint(), 120);
        };
      });

      const r = q('[data-refresh]');
      if (r) r.onclick = () => { store.refresh(); chrome.reload(); };

      const up = q('[data-upload]');
      if (up) up.onclick = () => {
        alert('Uploading from the console is out of scope for this lab.\n\n' +
              'Use the terminal instead:  s3 cp <file> s3://bda-lake/<key>');
      };
    }

    /* ---------- boot this instance ---------- */

    chrome = BrowserChrome.create(root, {
      favicon: FAVICON,
      title: 'MinIO Console',
      origin: 'localhost:9001',
      secure: false,                 // plain http, as a local container is
      start: '/browser/' + BUCKET,
      render: render,
      onClose: function () { if (store.close) store.close(); }
    });
    chrome.start();

    // Repaint only when something the page actually shows has moved.
    let lastKey = '';
    const off = store.onChange(function (s) {
      const key = JSON.stringify([
        s.env && s.env.minio, s.bucketCreated,
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

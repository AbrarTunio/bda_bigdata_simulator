/* ============================================================
   launcher.js — opens the MinIO and AWS consoles as simulated
   browser windows floating over the lab.

   Deliberately NOT window.open(). A real popup arrives with the
   host browser's own address bar showing wherever this file is
   served from — file:///.../console/minio.html, or 127.0.0.1 on
   a dev server — sitting directly above the address bar the
   console draws for itself. Two contradicting URLs teach the
   student the wrong thing.

   So the browser is drawn: BDA.simWindow gives us the frame,
   BDA.apps.{minio,aws} draw the page inside it, and the URL on
   screen is only ever the one the real console would show. It
   is never navigated to.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.consoles = (function () {

  const URLS = {
    minio: { shown: 'http://localhost:9001',               label: 'MinIO Console' },
    aws:   { shown: 'https://s3.console.aws.amazon.com',   label: 'AWS Console' }
  };

  /**
   * The console apps talk to the lab only through this object, so the
   * same app code runs here and in a directly-opened console/*.html.
   */
  function makeStore(win) {
    return {
      state:    () => BDA.bridge.snapshot(),
      send:     (action, payload) => BDA.bridge.dispatch(action, payload),
      onChange: fn => BDA.bridge.subscribe(fn),
      refresh:  () => BDA.bridge.publish(),
      close:    () => win.close()
    };
  }

  function launch(kind) {
    const app = BDA.apps[kind];
    const meta = URLS[kind];
    BDA.simWindow.show({
      id: kind,
      label: meta.label,
      fav: app.FAVICON,
      width:  kind === 'aws' ? 1240 : 1180,
      height: kind === 'aws' ? 820 : 760,
      mount: (rootEl, win) => app.mount(rootEl, makeStore(win))
    });
    BDA.util.toast(meta.label + ' — ' + meta.shown);
  }

  function openMinio() {
    const S = BDA.state.S;
    launch('minio');
    BDA.terminal.line(
      '<span class="d"># browser: ' + URLS.minio.shown +
      (S.env.minio ? '' : ' — expect ERR_CONNECTION_REFUSED, MinIO is down') + '</span>');
  }

  function openAws() {
    launch('aws');
    BDA.terminal.line('<span class="d"># browser: ' + URLS.aws.shown + '</span>');
  }

  function closeAll() { BDA.simWindow.closeAll(); }

  /* ---- commands the console windows send back to the lab ---- */
  function wire() {
    const B = BDA.bridge, T = BDA.terminal;

    // A successful MinIO login completes setup item D.
    B.on('minio:login', () => {
      const S = BDA.state.S;
      S.env.minioSeen = true;
      S.done['minio'] = true;
      BDA.nav.render();
      BDA.panels.renderProgress();
      BDA.state.save();
      T.line('<span class="d"># MinIO console: signed in as minioadmin</span>');
    });

    B.on('aws:seen', () => {
      BDA.state.S.env.awsConsoleSeen = true;
      BDA.state.save();
    });

    // Deleting a prefix in the object browser really removes it.
    B.on('minio:rm', p => {
      const S = BDA.state.S;
      const before = S.files.length;
      S.files = S.files.filter(f => f.path !== p.path && f.path.indexOf(p.path) !== 0);
      if (S.files.length !== before) {
        T.echo('s3 rm --recursive s3://bda-lake/' + p.path);
        T.line('delete: s3://bda-lake/' + p.path, '');
        T.line('<span class="d"># deleted from the console — same bucket, same effect</span>');
        BDA.panels.renderStore(true);
        BDA.state.save();
      }
    });

    // The console can print into the lab terminal, which keeps the
    // two views telling one story.
    B.on('term', p => { T.line(BDA.util.esc(p.text || ''), p.cls || 'd'); });
  }

  return { openMinio, openAws, closeAll, wire, makeStore, URLS };
})();

/* ============================================================
   step-panel.js — renders whichever step is selected: the
   teaching callouts, the command blocks, the console launchers
   and (on the last step) the write-up form.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.stepPanel = (function () {
  const { esc, highlight, copy } = BDA.util;

  let currentId = 'aws';
  function current() { return currentId; }
  function byId(id) { return BDA.data.ALL.find(x => x.id === id); }

  /* ---- console launcher blocks (the two `special` setup items) ---- */

  function awsLauncher() {
    const S = BDA.state.S;
    const made = !!S.env.awsAcct;
    return '' +
      '<div class="launch-row">' +
        '<button class="btn btn-ghost" style="font-size:13px;padding:10px 20px" ' +
          'onclick="BDA.awsSignup.open()">' +
          (made ? '✓ Account created — review' : 'Start sign-up') +
        '</button>' +
        (made
          ? '<button class="btn btn-launch" onclick="BDA.consoles.openAws()">' +
            '↗ Open AWS Console <span class="ext">new window</span></button>'
          : '') +
      '</div>' +
      (made
        ? '<p class="launch-note">Account <code>' + esc(S.env.awsAcct) + '</code> created (simulated). ' +
          'The console opens at <span class="launch-url">console.aws.amazon.com</span></p>'
        : '<p class="launch-note">Sign up first — the console needs an account, exactly as it does for real.</p>');
  }

  function minioLauncher() {
    const S = BDA.state.S;
    return '' +
      '<div class="launch-row">' +
        '<button class="btn btn-launch" onclick="BDA.consoles.openMinio()">' +
          '↗ Open MinIO Console <span class="ext">new window</span>' +
        '</button>' +
      '</div>' +
      '<p class="launch-note">Opens <span class="launch-url">http://localhost:9001</span> in its own window. ' +
      (S.env.minio
        ? 'MinIO is running — log in with <code>minioadmin</code> / <code>minioadmin</code>.'
        : 'MinIO is not running yet, so you will get a connection error — start it in Step 1.') +
      '</p>';
  }

  /* ---- command block ---- */

  function cmdBlock(c) {
    const ran = BDA.state.S.done['cmd:' + c.id];
    const tag = c.tag
      ? ' <span class="tag ' + c.tag + '">' + (c.tag === 'added' ? 'added for sim' : 'review only') + '</span>'
      : '';
    return '' +
      '<div class="cmd">' +
        '<div class="cmd-bar">' +
          '<span class="lbl">' + esc(c.lbl) + tag + '</span>' +
          '<button class="btn btn-copy" onclick="BDA.stepPanel.copyCmd(\'' + c.id + '\')">⧉ Copy</button>' +
          '<button class="btn btn-run" id="run-' + c.id + '" onclick="BDA.runner.run(\'' + c.id + '\')">' +
            (ran ? '↻ Run again' : '▶ Run') +
          '</button>' +
        '</div>' +
        '<pre id="code-' + c.id + '">' + highlight(c.code) + '</pre>' +
      '</div>';
  }

  /* ---- final deliverable ---- */

  const POINTS = [
    'Transient vs always-on — your cost figures, and when always-on still wins',
    'On-demand vs spot — which node groups you’d put on spot, and why',
    'EMR vs HDInsight vs serverless SQL for THIS job, with a recommendation',
    'The three things that broke moving from HDFS to object storage',
    'One sentence: what does the managed service NOT do for you?'
  ];

  function deliverableHtml() {
    return '' +
      '<div class="teach" style="border-left-color:var(--ok);background:var(--ok-soft);border-color:var(--ok-line)">' +
        '<span class="ic">✍️</span><p><strong>Final deliverable (250–300 words).</strong> ' +
        'Cover all five points. Point 5 carries the most marks.</p></div>' +
      '<div class="deliv">' +
        POINTS.map((t, i) =>
          '<label class="pt"><input type="checkbox" class="pt-chk"> <span>' + (i + 1) + '. ' + t + '</span></label>'
        ).join('') +
        '<textarea id="delivText" placeholder="Write your comparison here…"></textarea>' +
        '<div class="wc"><span id="wc">0 words · 0 / 5 points checked</span>' +
          '<button class="btn btn-copy" onclick="BDA.stepPanel.copyDeliv()">⧉ Copy write-up</button></div>' +
      '</div>';
  }

  function wireDeliverable() {
    const ta = document.getElementById('delivText');
    const chks = [].slice.call(document.querySelectorAll('.pt-chk'));
    const upd = () => {
      const w = (ta.value.trim().match(/\S+/g) || []).length;
      const c = chks.filter(x => x.checked).length;
      const el = document.getElementById('wc');
      el.textContent = w + ' words · ' + c + ' / 5 points checked';
      el.className = (w >= 250 && w <= 320 && c === 5) ? 'wc-ok' : '';
    };
    ta.addEventListener('input', upd);
    chks.forEach(c => c.addEventListener('change', upd));
  }

  /* ---- the panel itself ---- */

  function render() {
    const x = byId(currentId);
    const isSetup = BDA.data.SETUP.indexOf(x) !== -1;
    const p = document.getElementById('stepPanel');

    let html =
      '<div class="step-head">' +
        '<div class="step-eyebrow ' + (isSetup ? 'setup' : '') + '">' + esc(x.eyebrow) + '</div>' +
        '<h2>' + esc(x.title) + '</h2>' +
        '<p class="lede">' + esc(x.lede) + '</p>' +
      '</div><div class="step-body">';

    (x.teach || []).forEach(t => {
      html += '<div class="teach ' + (t.cls || '') + '"><span class="ic">' + t.ic + '</span><p>' + t.html + '</p></div>';
    });

    if (x.special === 'aws') html += awsLauncher();
    if (x.special === 'minio') html += minioLauncher();

    (x.cmds || []).forEach(c => { html += cmdBlock(c); });

    if (x.action) {
      html += '<div style="margin:2px 0 14px"><button class="btn btn-ghost" ' +
              'style="font-size:13px;padding:9px 18px" onclick="' + x.action.fn + '()">' +
              x.action.label + '</button></div>';
    }

    if (x.deliverable) html += deliverableHtml();

    const idx = BDA.data.ALL.indexOf(x);
    const prev = BDA.data.ALL[idx - 1], next = BDA.data.ALL[idx + 1];
    html += '<div class="step-nav-btns">' +
      '<button class="btn btn-step" ' + (prev ? '' : 'disabled') + ' ' +
        (prev ? 'onclick="BDA.stepPanel.select(\'' + prev.id + '\')"' : '') + '>← ' +
        (prev ? esc(prev.title.slice(0, 20)) : 'Start') + '</button>' +
      ((x.cmds && x.cmds.length > 1)
        ? '<button class="btn btn-run-all" onclick="BDA.runner.runAll(\'' + x.id + '\')">▶▶ Run all in step</button>'
        : '') +
      '<button class="btn btn-step" ' + (next ? '' : 'disabled') + ' ' +
        (next ? 'onclick="BDA.stepPanel.select(\'' + next.id + '\')"' : '') + '>' +
        (next ? esc(next.title.slice(0, 20)) : 'Done') + ' →</button>' +
      '</div>';

    p.innerHTML = html + '</div>';
    if (x.deliverable) wireDeliverable();
  }

  function select(id) {
    currentId = id;
    render();
    BDA.nav.render();
    document.getElementById('stepPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyCmd(id) {
    const found = BDA.runner.findCmd(id);
    if (found) copy(found.c.code, 'Command copied');
  }

  function copyDeliv() {
    const ta = document.getElementById('delivText');
    if (ta) copy(ta.value, 'Write-up copied');
  }

  return { render, select, current, byId, copyCmd, copyDeliv };
})();

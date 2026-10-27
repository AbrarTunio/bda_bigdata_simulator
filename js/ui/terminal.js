/* ============================================================
   terminal.js — owns the bash pane: printing, the fake prompt,
   and the handful of commands a student can free-type.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.terminal = (function () {
  const { esc, human, sleep } = BDA.util;
  const PROMPT = { user: 'student', host: 'bda-lab' };

  let el = null, input = null;

  function prompt() { return PROMPT.user + '@' + PROMPT.host + ':' + BDA.state.S.cwd + '$'; }

  function line(html, cls) {
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'ln ' + (cls || '');
    d.innerHTML = html;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  /** Print a prompt line with the given text as the typed command. */
  function echo(text) {
    line('<span class="prompt"><span class="u">' + esc(prompt()) +
         '</span> <span class="cmd">' + esc(text) + '</span></span>');
  }

  /** Print a multi-line command the way bash continues it with ">". */
  function echoBlock(code) {
    code.split('\n').forEach((l, i) => {
      if (i === 0) echo(l);
      else line('<span class="d">&gt; ' + esc(l) + '</span>');
    });
  }

  /** out[] row -> one printed line. */
  function out(spec) {
    const cls = spec[0], text = spec[1], isPrompt = spec[2], answer = spec[3];
    if (isPrompt) {
      line('<span class="d">' + esc(text) + '</span><span class="b">' + esc(answer || '') + '</span>');
    } else {
      line(esc(text), cls);
    }
  }

  /** Print a block of output with a pace that feels like a real command. */
  async function stream(rows) {
    for (const r of rows) {
      out(r);
      await sleep(Math.max(40, 220 - rows.length * 12));
    }
  }

  function clear() { if (el) el.innerHTML = ''; welcome(); }

  function welcome() {
    line('<span class="d"># Big Data Lab — local environment. Use the ▶ Run buttons above, or type a command.</span>');
    line('<span class="d"># try: help · ls · s3 ls s3://bda-lake · consoles · clear</span>');
  }

  /* ---- free-typed commands ---- */
  function handleTyped(v) {
    const S = BDA.state.S;
    const c = v.toLowerCase();

    if (c === 'clear') { clear(); return; }

    if (c === 'help') {
      ['Available in this simulator:',
       '  help                     show this message',
       '  ls                       list local ~/lab8 files',
       '  s3 ls s3://bda-lake      list objects in the lake',
       '  pwd                      print working directory',
       '  consoles                 open the MinIO / AWS console windows',
       '  clear                    clear the screen',
       'Everything else: use the ▶ Run buttons — the lab commands are pre-written.'
      ].forEach((l, i) => line(esc(l), i === 0 ? 'a' : 'd'));
      return;
    }

    if (c === 'consoles') {
      line('opening console windows…', 'v');
      BDA.consoles.openMinio();
      BDA.consoles.openAws();
      return;
    }
    if (c === 'minio' || c === 'open minio') { BDA.consoles.openMinio(); return; }
    if (c === 'aws console' || c === 'console') { BDA.consoles.openAws(); return; }

    if (c === 'pwd') { line(S.cwd.replace('~', '/home/student'), ''); return; }

    if (c === 'ls') {
      if (!S.local.length) { line('<span class="d">(no files yet in ~/lab8)</span>'); return; }
      line(S.local.map(f => f.name).join('   '), 't');
      return;
    }

    if (c.indexOf('s3 ls') === 0) {
      if (!S.env.minio) {
        line('Could not connect to the endpoint URL: "http://localhost:9000"', 'r');
        line('<span class="d">start MinIO first (Step 1)</span>');
        return;
      }
      if (!S.files.length) { line('<span class="d">(bucket empty)</span>'); return; }
      S.files.forEach(f => line(
        '<span class="d">2026-10-26 09:14  ' + human(f.size).padStart(9) + ' </span>' + esc(f.path)));
      return;
    }

    line(esc(v.split(' ')[0]) + ': command not found', 'r');
    line('<span class="d">this is a simulator — use the ▶ Run buttons, or type: help</span>');
  }

  function init() {
    el = document.getElementById('term');
    input = document.getElementById('termInput');
    document.getElementById('termClear').onclick = clear;

    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || BDA.runner.isBusy()) return;
      const v = input.value.trim();
      input.value = '';
      if (!v) return;
      echo(v);
      handleTyped(v);
    });
  }

  return { init, line, echo, echoBlock, stream, clear, welcome, prompt };
})();

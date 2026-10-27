/* ============================================================
   runner.js — executes a command block: gate check, echo the
   command, stream its output, apply the effect, mark progress.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.runner = (function () {
  const { sleep } = BDA.util;

  let busy = false;
  function isBusy() { return busy; }

  function setBusy(on) {
    busy = on;
    document.querySelectorAll('.btn-run,.btn-run-all,.btn-ghost,.btn-launch')
      .forEach(b => { b.disabled = on; });
  }

  /** Find a command and the step that owns it. */
  function findCmd(id) {
    for (const x of BDA.data.ALL) {
      for (const c of (x.cmds || [])) if (c.id === id) return { x, c };
    }
    return null;
  }

  /** Gates that mirror real failure modes rather than hiding the button. */
  function blockedReason(c) {
    const S = BDA.state.S;
    if (c.need === 'minio' && !S.env.minio) {
      return 'MinIO isn\u2019t running. Run Step 1 first.';
    }
    if (c.need === 'curated' && !S.files.some(f => f.path.indexOf('curated/') === 0)) {
      return 'No curated data yet. Run Step 5 first.';
    }
    return null;
  }

  async function run(id) {
    if (busy) return;
    const found = findCmd(id);
    if (!found) return;
    const { x, c } = found;

    const reason = blockedReason(c);
    if (reason) {
      BDA.terminal.echo('(blocked)');
      BDA.terminal.line(reason, 'r');
      return;
    }

    setBusy(true);
    if (/cd ~\/lab8/.test(c.code)) BDA.state.S.cwd = '~/lab8';

    BDA.terminal.echoBlock(c.code);
    await sleep(300);
    await BDA.terminal.stream(c.out);

    BDA.effects.apply(c.fx);
    BDA.state.S.done['cmd:' + id] = true;
    markComplete(x);

    setBusy(false);
    BDA.stepPanel.render();
    BDA.nav.render();
    BDA.state.save();
  }

  async function runAll(stepId) {
    if (busy) return;
    const x = BDA.stepPanel.byId(stepId);
    for (const c of (x.cmds || [])) {
      await run(c.id);
      await sleep(250);
    }
  }

  /** A step is done when every command in it has run. */
  function markComplete(x) {
    const S = BDA.state.S;
    if (x.cmds && x.cmds.length && x.cmds.every(c => S.done['cmd:' + c.id])) {
      S.done[x.id] = true;
    }
    if (x.special === 'aws' && S.env.awsAcct) S.done[x.id] = true;
    if (x.special === 'minio' && S.env.minioSeen) S.done[x.id] = true;
    BDA.panels.renderProgress();
  }

  return { run, runAll, findCmd, isBusy, setBusy, markComplete };
})();

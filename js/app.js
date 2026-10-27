/* ============================================================
   app.js — boot order and the few global wires.
   Nothing here knows about lab content; it only connects the
   modules that do.
   ============================================================ */
(function () {

  function renderAll() {
    BDA.nav.render();
    BDA.stepPanel.render();
    BDA.panels.renderEnv();
    BDA.panels.renderStore();
    BDA.panels.renderCluster();
    BDA.panels.renderCost();
    BDA.panels.renderProgress();
  }

  function wireChrome() {
    // overlay close buttons and click-outside
    document.querySelectorAll('[data-close]').forEach(b => {
      b.onclick = () => document.getElementById(b.dataset.close).classList.remove('show');
    });
    document.querySelectorAll('.overlay').forEach(o => {
      o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
    });

    document.getElementById('btnReset').onclick = () => {
      if (!confirm('Reset the simulator? All progress, files and the terminal will be cleared.')) return;
      BDA.consoles.closeAll();
      BDA.state.reset();
      BDA.terminal.clear();
      BDA.stepPanel.select('aws');
      renderAll();
      BDA.util.toast('Simulator reset');
    };
  }

  function init() {
    BDA.bridge.init();
    BDA.consoles.wire();
    BDA.terminal.init();
    wireChrome();

    const restored = BDA.state.load();
    renderAll();
    BDA.terminal.welcome();
    if (restored) {
      BDA.terminal.line('<span class="d"># restored previous session \u2014 run \u21BB to replay a step, ' +
                        'or \u21BA Reset to start fresh.</span>');
    }
    BDA.bridge.publish();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

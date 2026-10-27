/* ============================================================
   nav.js — the left rail. Reads BDA.data.ALL and the done map;
   clicking an item delegates to BDA.stepPanel.select().
   ============================================================ */
window.BDA = window.BDA || {};

BDA.nav = (function () {
  const { esc } = BDA.util;

  function item(x) {
    const S = BDA.state.S;
    const li = document.createElement('li');
    li.className = 'nav-item' +
      (S.done[x.id] ? ' done' : '') +
      (BDA.stepPanel.current() === x.id ? ' active' : '');
    li.innerHTML =
      '<span class="nav-num"><span>' + esc(x.num) + '</span></span>' +
      '<span class="nav-title">' + esc(x.title) + '</span>';
    li.onclick = () => BDA.stepPanel.select(x.id);
    return li;
  }

  function render() {
    const setup = document.getElementById('navSetup');
    const steps = document.getElementById('navSteps');
    setup.innerHTML = '';
    steps.innerHTML = '';
    BDA.data.SETUP.forEach(x => setup.appendChild(item(x)));
    BDA.data.STEPS.forEach(x => steps.appendChild(item(x)));
    BDA.panels.renderProgress();
  }

  return { render };
})();

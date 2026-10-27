/* ============================================================
   aws-signup.js — the four-screen simulated AWS sign-up.
   Stays an in-app dialog on purpose: it is a form, not a
   console, and the warning that nothing is real must stay
   attached to it.
   ============================================================ */
window.BDA = window.BDA || {};

BDA.awsSignup = (function () {
  let screen = 0;

  const BANNER =
    '<div class="sim-banner"><span>\u{1F512}</span><span>Simulation only. No account is created, ' +
    'no card is charged. The lab runs entirely on local MinIO.</span></div>';

  function dots(n) {
    return '<div class="m-dots">' +
      [0, 1, 2].map(i => '<i class="' + (i <= n ? 'on' : '') + '"></i>').join('') + '</div>';
  }

  function newAccountId() {
    const id = '4071' + Math.floor(1000 + Math.random() * 8999) + Math.floor(1000 + Math.random() * 8999);
    return id.slice(0, 12).replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3');
  }

  function render() {
    const b = document.getElementById('awsBody');
    const f = document.getElementById('awsFoot');
    const t = document.getElementById('awsTitle');

    if (screen === 0) {
      t.textContent = 'Create an AWS account';
      b.innerHTML = BANNER +
        '<div class="field"><label>Root user email address</label>' +
        '<input id="aw-email" placeholder="you@example.com"></div>' +
        '<div class="field"><label>AWS account name</label>' +
        '<input id="aw-name" placeholder="bda-lab-personal"></div>';
      f.innerHTML = dots(0) + '<button class="btn-primary" onclick="BDA.awsSignup.next()">Verify email \u2192</button>';

    } else if (screen === 1) {
      t.textContent = 'Secure your account';
      b.innerHTML = BANNER +
        '<div class="field"><label>Root password</label>' +
        '<input type="password" value="demo-password"></div>' +
        '<div class="field"><label>Confirm password</label>' +
        '<input type="password" value="demo-password"></div>';
      f.innerHTML = dots(1) + '<button class="btn-primary" onclick="BDA.awsSignup.next()">Continue \u2192</button>';

    } else if (screen === 2) {
      t.textContent = 'Billing information';
      b.innerHTML = BANNER +
        '<div class="field"><label>Card number</label><input value="4242 4242 4242 4242"></div>' +
        '<div class="field"><div class="row2">' +
          '<div><label>Expiry</label><input value="12/30"></div>' +
          '<div><label>CVC</label><input value="123"></div>' +
        '</div></div>' +
        '<p style="font-size:11px;color:var(--ink-3);margin:0">Dummy values \u2014 nothing is submitted anywhere.</p>';
      f.innerHTML = dots(2) + '<button class="btn-primary" onclick="BDA.awsSignup.next()">Create account \u2192</button>';

    } else {
      const S = BDA.state.S;
      if (!S.env.awsAcct) S.env.awsAcct = newAccountId();
      t.textContent = 'Account ready';
      b.innerHTML =
        '<div class="aws-done"><div class="big">\u2705</div>' +
        '<h4>Your (simulated) AWS account is ready</h4>' +
        '<p>Open the console to see the S3 and EMR views you would get for real.</p>' +
        '<p style="color:var(--ink-3);font-size:12px">The lab itself still runs on local MinIO \u2014 nothing here spends money.</p>' +
        '<span class="acct">Account ID: ' + S.env.awsAcct + '</span></div>';
      f.innerHTML =
        '<button class="btn-reset" onclick="BDA.awsSignup.close()">Close</button>' +
        '<button class="btn-primary" onclick="BDA.awsSignup.close();BDA.consoles.openAws()">' +
        'Open AWS Console \u2197</button>';

      S.done['aws'] = true;
      BDA.nav.render();
      BDA.panels.renderEnv();
      BDA.panels.renderProgress();
      BDA.state.save();
    }
  }

  function open() { screen = 0; render(); document.getElementById('awsOverlay').classList.add('show'); }
  function next() { screen++; render(); }
  function close() { document.getElementById('awsOverlay').classList.remove('show'); BDA.stepPanel.render(); }

  return { open, next, close, render };
})();

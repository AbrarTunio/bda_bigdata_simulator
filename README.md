# Big Data Lab Simulator — Deploying managed Spark on object storage (EMR / HDInsight)

A teaching simulator. The student works through 16 items — 4 environment setup
items and 12 lab steps — in a fake terminal, and watches a bucket, a cluster and
a bill react. The MinIO and AWS consoles open as **simulated browser windows
drawn inside the page**, address bar and all, so the URL is part of the lesson.

Nothing talks to the network. No AWS account, no Docker, no MinIO server is
contacted at any point.

## Running it

Double-clicking `index.html` works. Everything is plain `<script>` tags and
plain CSS — no build step, no bundler, no ES modules (deliberately: ES modules
fail CORS on `file://`).

Serving the folder also works, and is nicer if you are editing:

```
python -m http.server 8000
# then open http://localhost:8000/
```

Nothing here needs a server. The consoles are not real windows, so there is no
pop-up blocker to fight and no cross-window channel that can fail on `file://`.

## Layout

```
index.html                 the lab shell — loads 11 stylesheets, 18 scripts
css/
  tokens.css               every colour, radius, shadow and font as a variable
  base.css                 reset and page shell
  layout.css               topbar, 3-column app grid, responsive breakpoints
  components.css           chips, buttons, panels, command blocks, toasts
  terminal.css             the terminal and its colour classes
  panels.css               storage tree, cluster pipeline, cost meters
  modal.css                overlays and the AWS sign-up flow
  sim-window.css           the floating console windows: frame, drag, dock
js/
  core/
    utils.js               BDA.util — escaping, formatting, toasts, clipboard
    state.js               BDA.state — the single state object, save/load/reset
    bridge.js              in-process bus between the lab and its consoles
  data/
    setup.js               BDA.data.SETUP — the 4 environment items
    steps.js               BDA.data.STEPS — the 12 lab steps
  engine/
    effects.js             BDA.effects — the ONLY place that mutates state
    runner.js              BDA.runner — runs a command, enforces the gates
  ui/
    nav.js, step-panel.js, panels.js, terminal.js
  consoles/
    sim-window.js          window manager: drag, resize, maximise, minimise
    launcher.js            opens the consoles, handles what they send back
    aws-signup.js          the simulated account sign-up flow
  app.js                   boot order
console/                   the two consoles (loaded by index.html, not visited)
  minio.html / aws.html    optional standalone pages — a read-only mirror
  css/browser-chrome.css   the simulated Chrome frame (tabs, omnibox, error page)
  css/minio.css            MinIO's "Fresh Raspberry" palette
  css/aws.css              Cloudscape Design System v3 tokens + squid-ink nav
  js/chrome.js             BrowserChrome.create — tab, address bar, history
  js/minio.js              BDA.apps.minio — login, bucket list, object browser
  js/aws.js                BDA.apps.aws — Console Home, S3, EMR, Billing
  js/standalone.js         boots a console when its page is opened on its own
```

`Big Data Lab Simulator — EMR _ HDInsight.html` and `_original-backup.html` are
the pre-split monolith, kept for reference. Nothing loads them; delete them when
you are happy with the split.

## How to change things

**Add or edit a lab step.** Steps are data. Open `js/data/steps.js` and add an
object to `BDA.data.STEPS`:

```js
{
  id: 's13', num: 13, title: 'Title shown in the rail', eyebrow: 'STEP 13',
  lede: 'One sentence under the title.',
  teach: [
    { ic: '\u{1FAA3}', html: '<strong>The point.</strong> Why this step matters.' }
  ],
  cmds: [
    {
      id: 's13-run',
      lbl: 'Label on the Run button',
      code: 'spark-submit ...',               // what the student sees typed
      out: [['d', 'dim line'], ['', 'normal line'], ['g', 'green line']],
      fx: 'my-effect',                        // optional: the state change
      need: 'minio',                          // optional: a gate
      tag: 'added'                            // optional: badge on the block
    }
  ],
  deliverable: true                           // appends the write-up form
}
```

`out` lines are `[class, text]`; the classes are the single letters defined in
`css/terminal.css` -- `g` green, `r` red, `b` blue, `t` teal, `a` amber,
`v` violet, `d` dim.

`fx` is the only link to logic. Add a matching entry to the `TABLE` in
`js/engine/effects.js` — one function, taking the state object:

```js
'my-effect': S => { S.env.something = true; }
```

`need` is a gate: `'minio'` blocks the command until MinIO is up, `'curated'`
until the rollup output exists. Gates live in `blockedReason()` in
`js/engine/runner.js`.

**Change a colour.** `css/tokens.css` for the lab, `console/css/minio.css` and
`console/css/aws.css` for the two consoles. The console palettes are deliberately
*not* shared with the lab — they are supposed to look like someone else's product.

**Add a page to a console.** Each console is a tiny router. In
`console/js/aws.js`, `render(path)` matches on the path and returns a string;
`page({service, active, trail, body})` wraps it in the nav chrome.
`chrome.setOrigin()` changes the host in the address bar, which is how S3 and
EMR appear to live on different domains.

## Why the consoles are drawn, not opened

An earlier version opened them with `window.open()`. That fails in a way worth
recording: a real window arrives with the *host* browser's address bar, showing
`file:///.../console/minio.html` or `127.0.0.1:5500/console/minio.html`, sitting
directly above the address bar the console draws for itself. Two URLs
contradicting each other teach the student the wrong thing.

So the browser is drawn instead. `js/consoles/sim-window.js` gives it a frame
that drags, resizes, maximises, minimises to a dock and closes;
`console/js/chrome.js` draws the tab, the omnibox and the history buttons inside
it. The URL on screen is only ever the one the real console would show, and it
is never navigated to — no request leaves the page.

### How the consoles reach the lab

Both consoles live in the lab's own document now, so the bridge is a small
in-process bus (`js/core/bridge.js`):

| call | what it does |
|------|--------------|
| `snapshot()` | the lean projection a console renders |
| `subscribe(fn)` | notify on every state change; returns an unsubscribe |
| `dispatch(action, payload)` | a console asks the lab to do something |

A console never touches `BDA.state` directly. It gets a small **store**
(`state`, `send`, `onChange`, `refresh`, `close`) built in
`js/consoles/launcher.js`, which is the only reason the same console code also
runs in `console/minio.html` on its own — that page hands it a read-only store
backed by the `bda-sim-live` snapshot in `localStorage`.

Actions are handled in `js/consoles/launcher.js`:

| action        | what it does |
|---------------|--------------|
| `minio:login` | completes setup item D in the lab |
| `aws:seen`    | records that the student opened the AWS console |
| `minio:rm`    | **really** deletes the object, and echoes the `s3 rm` into the lab terminal |
| `term`        | lets a console print a line into the lab terminal |

Deleting an object in either console removes it from the lab's bucket and from
the other console. That is the point: one object store, two front ends.

Both consoles can be open at once, which is why `BrowserChrome` is a factory
(`create(root, cfg)`, every lookup scoped to `root`) and why the console apps
are mountable (`BDA.apps.minio.mount(root, store)` → `{chrome, destroy}`)
rather than singletons keyed off element ids.

## What each console shows

**MinIO** (`http://localhost:9001`) — if the container is not running the window
shows Chrome's `ERR_CONNECTION_REFUSED` page, which is the lesson for
Step 1. Signing in with `minioadmin` / `minioadmin` completes a setup item. The
object browser base64-encodes the prefix into the URL, exactly as MinIO does.

**AWS** — three services on the hosts and paths AWS really uses:

```
us-east-1.console.aws.amazon.com/console/home?region=us-east-1
s3.console.aws.amazon.com/s3/buckets?region=us-east-1
s3.console.aws.amazon.com/s3/buckets/bda-lake?region=us-east-1&tab=objects&prefix=raw/events/
us-east-1.console.aws.amazon.com/emr/home?region=us-east-1#/clusterDetails/j-1K48XKQ3HCB7Z
us-east-1.console.aws.amazon.com/costmanagement/home?region=us-east-1#/dashboard
```

The EMR page reads the lab's cluster state, so it moves through Starting →
Bootstrapping → Running → Terminating → Terminated as Step 6 runs. The billing
page renders whatever Step 7 computed.

## Terminal shortcuts

Besides the lab commands, the terminal accepts `help`, `clear`, `ls`, `pwd`,
`consoles` (opens both windows), `minio`, and `aws console`. Everything else
runs from the ▶ Run buttons, so the commands stay correct.

## Testing

There are no unit tests. The quickest check after a change is to open the lab,
type `consoles`, and run a few steps — the two windows should follow along.

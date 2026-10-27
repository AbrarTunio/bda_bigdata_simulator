/* ============================================================
   setup.js — the four optional setup items shown above the
   numbered lab steps. Pure data: the renderer knows nothing
   about any individual item.

   Shape of an entry:
     id, num, title, eyebrow, lede
     teach[]   {cls?, ic, html}
     cmds[]    {id, lbl, tag?, code, out[], fx?, need?}
     special?  'aws' | 'minio'   -> renders a console launcher
   out[] rows are [cssClass, text] or [cssClass, prompt, true, typedAnswer]
   ============================================================ */
window.BDA = window.BDA || {};
BDA.data = BDA.data || {};

BDA.data.SETUP = [
  {
    id:'aws', num:'A', title:'Create AWS account', eyebrow:'SETUP · OPTIONAL',
    lede:'A guided (simulated) AWS sign-up, so the console feels familiar. This lab needs no real account and spends no money — everything else runs locally against MinIO.',
    teach:[{cls:'setup',ic:'ℹ️',html:'On a real job you\u2019d do this once. We include it only so the flow looks like the real thing. <strong>Skip it and the lab still works.</strong>'}],
    special:'aws'
  },
  {
    id:'docker', num:'B', title:'Install & check Docker', eyebrow:'SETUP',
    lede:'Docker runs MinIO (our stand-in for S3) as a container. Confirm it\u2019s installed before anything else.',
    teach:[{cls:'setup',ic:'🐳',html:'A <strong>container</strong> is a sealed, disposable box that holds an app and everything it needs. MinIO ships as one, so you don\u2019t install it by hand.'}],
    cmds:[{ id:'docker-v', lbl:'Verify Docker', code:'docker --version && docker info --format "{{.ServerVersion}}" >/dev/null 2>&1 && echo "docker daemon: reachable"',
      out:[['g','Docker version 27.1.1, build 6312585'],['','docker daemon: reachable']], fx:'docker' }]
  },
  {
    id:'awscli', num:'C', title:'Configure the AWS CLI', eyebrow:'SETUP',
    lede:'The same aws command talks to both real S3 and MinIO. Point it at a region and give it keys. For MinIO we\u2019ll use minioadmin / minioadmin.',
    teach:[{cls:'setup',ic:'🔑',html:'<code>aws configure</code> saves credentials to <code>~/.aws/credentials</code>. In this lab the keys are local-only; in Step 11 you\u2019ll remove keys entirely and let the cluster\u2019s IAM role supply them.'}],
    cmds:[{ id:'aws-config', lbl:'Run aws configure', code:'aws configure',
      out:[['d','AWS Access Key ID [None]: ',true,'minioadmin'],
           ['d','AWS Secret Access Key [None]: ',true,'minioadmin'],
           ['d','Default region name [None]: ',true,'us-east-1'],
           ['d','Default output format [None]: ',true,'json'],
           ['g','credentials saved to ~/.aws/credentials']], fx:'cli' }]
  },
  {
    id:'minio', num:'D', title:'Open the MinIO console', eyebrow:'SETUP',
    lede:'MinIO has a web dashboard at http://localhost:9001 — the visual twin of the AWS S3 console. You can only reach it once MinIO is running (Step 1 starts it).',
    teach:[{cls:'setup',ic:'🖥️',html:'Having a browser view of your buckets next to the terminal is the fastest way to <strong>see</strong> what each command did. Keep it open as you work.'}],
    special:'minio'
  },
];

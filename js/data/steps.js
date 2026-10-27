/* ============================================================
   steps.js — the twelve numbered lab steps.

   Same shape as setup.js, plus two extras:
     action?      {id, label, fn}  -> a button wired to a global fn
     deliverable? true             -> appends the write-up form

   `need` gates a command on lab state: 'minio' requires the
   server to be up, 'curated' requires Step 5 to have written
   output. Blocked commands print a realistic error instead.
   ============================================================ */
window.BDA = window.BDA || {};
BDA.data = BDA.data || {};

BDA.data.STEPS = [
  {
    id:'s1', num:1, title:'Start storage & load the raw zone', eyebrow:'STEP 01',
    lede:'MinIO stands in for S3 with an identical API. Create the three-zone layout almost every data lake uses — raw, curated, results — and drop in the source data.',
    teach:[
      {ic:'🪣',html:'<strong>Zones are a convention, not a feature.</strong> Their value: permissions and retention can differ per zone, and everyone knows what a path means.'},
    ],
    cmds:[
      { id:'s1-start', lbl:'Start MinIO (S3-compatible)', code:
`docker start bda-minio 2>/dev/null || docker run -d --name bda-minio \\
  -p 9000:9000 -p 9001:9001 \\
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \\
  minio/minio server /data --console-address ':9001'
sleep 5
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export AWS_DEFAULT_REGION=us-east-1
alias s3='aws --endpoint-url http://localhost:9000 s3'`,
        out:[['d','Unable to find image \u2018minio/minio:latest\u2019 locally'],
             ['d','latest: Pulling from minio/minio'],
             ['d','a1f1879bb7de: Pull complete'],
             ['','Status: Downloaded newer image for minio/minio:latest'],
             ['t','e3c91a7f0b2d44a9c81e5f6a2b7d0c19ab3e4f5061728394a5b6c7d8e9f00112'],
             ['d','[+] API:  http://localhost:9000   Console: http://localhost:9001'],
             ['g','MinIO is up \u2014 console at http://localhost:9001 (minioadmin / minioadmin)']],
        fx:'minio-up' },
      { id:'s1-gen', lbl:'Generate the sample events (Lab 3.1 data)', tag:'added', code:
`# added for this simulator: recreates the Lab 3.1 sample if you don't have it
mkdir -p ~/lab3
python3 ~/lab3/gen_events.py --rows 4000000 > ~/lab3/events.json`,
        out:[['d','generating synthetic web events...'],
             ['','wrote 4,000,000 rows \u2192 ~/lab3/events.json'],
             ['t','size on disk: 1.1 GiB']],
        fx:'gen-events' },
      { id:'s1-load', lbl:'Create the bucket & load raw/', code:
`s3 mb s3://bda-lake
s3 cp ~/lab3/events.json s3://bda-lake/raw/events/events.json
s3 ls --recursive s3://bda-lake/ --human-readable`,
        out:[['t','make_bucket: bda-lake'],
             ['','upload: ~/lab3/events.json to s3://bda-lake/raw/events/events.json'],
             ['d','2026-10-26 09:14:02  1.1 GiB raw/events/events.json']],
        fx:'load-raw', need:'minio' },
    ]
  },
  {
    id:'s2', num:2, title:'Write the bootstrap action', eyebrow:'STEP 02',
    lede:'A bootstrap action runs on every node before the cluster is marked ready. It is where dependencies go — and the most common cause of a cluster that starts then instantly fails.',
    teach:[
      {ic:'⚡',html:'Two rules: <strong>fail fast</strong> with <code>set -e</code> so a broken node can\u2019t join silently, and <strong>keep it short</strong> — every second here is billed on every node.'},
    ],
    cmds:[
      { id:'s2-write', lbl:'Create & run bootstrap.sh', code:
`mkdir -p ~/lab8 && cd ~/lab8
cat > bootstrap.sh <<'EOF'
#!/bin/bash
set -euo pipefail
sudo python3 -m pip install --quiet pandas==2.2.2 boto3==1.34.100
python3 -c 'import pandas, boto3; print("deps ok", pandas.__version__)'
sudo mkdir -p /mnt/scratch && sudo chmod 1777 /mnt/scratch
echo "bootstrap complete on $(hostname)"
EOF
chmod +x bootstrap.sh
./bootstrap.sh`,
        out:[['d','installing pandas==2.2.2 boto3==1.34.100 ...'],
             ['g','deps ok 2.2.2'],
             ['','bootstrap complete on ip-10-0-1-42']],
        fx:'mk-bootstrap' },
      { id:'s2-up', lbl:'Upload to the scripts zone', code:`s3 cp bootstrap.sh s3://bda-lake/scripts/bootstrap.sh`,
        out:[['','upload: ./bootstrap.sh to s3://bda-lake/scripts/bootstrap.sh']], fx:'up-bootstrap', need:'minio' },
    ]
  },
  {
    id:'s3', num:3, title:'Write the job as a submittable step', eyebrow:'STEP 03',
    lede:'An EMR step is just a spark-submit with arguments. Make every path a parameter — a job with a hard-coded bucket can\u2019t be promoted from dev to prod without editing code.',
    teach:[
      {ic:'🧩',html:'The job prints its own row counts, so the logs are self-documenting. On a finished cluster, those printed lines are often your <strong>only</strong> view into what a step did.'},
    ],
    cmds:[
      { id:'s3-write', lbl:'Create daily_rollup.py', code:
`cat > ~/lab8/daily_rollup.py <<'PYEOF'
import sys
from pyspark.sql import SparkSession
from pyspark.sql.functions import to_timestamp, to_date, hour, sum as _sum, count

src, dst = sys.argv[1], sys.argv[2]
spark = SparkSession.builder.appName("daily-rollup").getOrCreate()
raw = spark.read.json(src)
print(f"[job] read {raw.count()} rows from {src}")
out = (raw
   .withColumn("ts", to_timestamp("event_time"))
   .withColumn("day", to_date("ts")).withColumn("hr", hour("ts"))
   .groupBy("day","hr","host","action")
   .agg(_sum("bytes").alias("total_bytes"), count("*").alias("event_count")))
n = out.count()
print(f"[job] writing {n} aggregated rows to {dst}")
out.repartition("day").write.mode("overwrite").partitionBy("day").parquet(dst)
print("[job] done")
spark.stop()
PYEOF`,
        out:[['t','written ~/lab8/daily_rollup.py (23 lines)']], fx:'mk-job' },
      { id:'s3-up', lbl:'Upload the job to scripts/', code:`s3 cp ~/lab8/daily_rollup.py s3://bda-lake/scripts/daily_rollup.py`,
        out:[['','upload: ~/lab8/daily_rollup.py to s3://bda-lake/scripts/daily_rollup.py']], fx:'up-job', need:'minio' },
    ]
  },
  {
    id:'s4', num:4, title:'Configure Spark for object storage', eyebrow:'STEP 04',
    lede:'These are the settings that make Spark talk S3. On real EMR most are set for you — writing them once means you understand what the managed service configured on your behalf.',
    teach:[
      {ic:'🔧',html:'<code>path.style.access</code> is required for MinIO and harmless elsewhere. On AWS you\u2019d drop the endpoint and the keys and rely on the instance role instead (Step 11).'},
    ],
    cmds:[
      { id:'s4-conf', lbl:'Create s3.conf', code:
`cat > ~/lab8/s3.conf <<'EOF'
spark.hadoop.fs.s3a.endpoint                 http://localhost:9000
spark.hadoop.fs.s3a.access.key               minioadmin
spark.hadoop.fs.s3a.secret.key               minioadmin
spark.hadoop.fs.s3a.path.style.access        true
spark.hadoop.fs.s3a.connection.ssl.enabled   false
spark.hadoop.fs.s3a.aws.credentials.provider org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider
spark.hadoop.fs.s3a.fast.upload              true
spark.hadoop.fs.s3a.connection.maximum       64
EOF`,
        out:[['t','written ~/lab8/s3.conf (8 properties)'],
             ['a','keep this out of version control \u2014 it contains keys']], fx:'mk-conf' },
    ]
  },
  {
    id:'s5', num:5, title:'Run the step locally, end to end', eyebrow:'STEP 05',
    lede:'This is the equivalent of a cluster step running. Watch the row counts the job prints, and note the wall time — it feeds the cost model in Step 7.',
    teach:[
      {ic:'▶️',html:'The output is written <strong>partitioned by day</strong>. Partitioning is how later queries skip data they don\u2019t need — the single most effective big-data speed-up.'},
    ],
    cmds:[
      { id:'s5-run', lbl:'spark-submit the rollup', code:
`cd ~/lab8
time spark-submit \\
  --properties-file s3.conf \\
  --packages org.apache.hadoop:hadoop-aws:3.3.4 \\
  daily_rollup.py \\
  s3a://bda-lake/raw/events/events.json \\
  s3a://bda-lake/curated/daily_rollup`,
        out:[['d','Ivy: resolving org.apache.hadoop:hadoop-aws:3.3.4 ...'],
             ['d','24/10/26 09:21:10 INFO SparkContext: Running Spark 3.5.1'],
             ['b','[job] read 4000000 rows from s3a://bda-lake/raw/events/events.json'],
             ['b','[job] writing 2184 aggregated rows to s3a://bda-lake/curated/daily_rollup'],
             ['g','[job] done'],
             ['','real    0m48.213s'],
             ['d','user    1m22.004s'],
             ['d','sys     0m06.511s']],
        fx:'run-job', need:'minio' },
    ]
  },
  {
    id:'s6', num:6, title:'Prove the cluster is disposable', eyebrow:'STEP 06',
    lede:'The whole transient-cluster argument rests on one claim: terminating the compute loses nothing. Test it — kill Spark completely, start fresh with no shared state, and read the results back.',
    teach:[
      {ic:'♻️',html:'This is what storage/compute separation buys you. On a classic HDFS cluster the data lives <em>on</em> the nodes, so killing them destroys it. Here the data never left S3.'},
    ],
    cmds:[
      { id:'s6-kill', lbl:'Kill all compute, then re-read', code:
`pkill -f SparkSubmit 2>/dev/null; sleep 2
echo '--- all compute gone, data untouched ---'
pyspark --properties-file ~/lab8/s3.conf \\
  --packages org.apache.hadoop:hadoop-aws:3.3.4
# inside the fresh shell:
df = spark.read.parquet("s3a://bda-lake/curated/daily_rollup")
print("rows:", df.count())
df.groupBy("day").sum("event_count").orderBy("day").show(5)`,
        out:[['a','--- all compute gone, data untouched ---'],
             ['d','Welcome to a brand-new pyspark session (no shared state)'],
             ['b','rows: 2184'],
             ['d','+----------+-----------------+'],
             ['d','|       day|sum(event_count)|'],
             ['d','+----------+-----------------+'],
             ['','|2026-10-20|           512340|'],
             ['','|2026-10-21|           498112|'],
             ['','|2026-10-22|           503998|'],
             ['d','+----------+-----------------+'],
             ['g','same data, different process \u2014 the cluster was disposable']],
        fx:'disposable', need:'curated' },
    ]
  },
  {
    id:'s7', num:7, title:'Cost the run three ways', eyebrow:'STEP 07',
    lede:'Do the arithmetic before you ever launch. Use your measured runtime as the per-node estimate and scale it. This takes two minutes and is the difference between a $1 job and a $400 surprise.',
    teach:[
      {ic:'🧮',html:'Watch the <strong>cost panel</strong> on the right fill in. The last figure — a cluster nobody terminated for a week — is why every cluster you create gets <code>--auto-terminate</code>.'},
    ],
    cmds:[
      { id:'s7-cost', lbl:'Create & run cost.py', code:
`cat > ~/lab8/cost.py <<'EOF'
RUNTIME_H  = 0.75      # cluster lifetime incl. ~8 min startup
CORE_NODES = 4; PRIMARY = 1
ON_DEMAND  = 0.214     # m5.xlarge, eu-west-1
EMR_UPLIFT = 0.054     # EMR per-instance-hour service charge
SPOT_DISC  = 0.70; GB_SCANNED = 20
inst_h = (CORE_NODES + PRIMARY) * RUNTIME_H
od   = inst_h*ON_DEMAND + inst_h*EMR_UPLIFT
spot = (PRIMARY*RUNTIME_H*ON_DEMAND
        + CORE_NODES*RUNTIME_H*ON_DEMAND*(1-SPOT_DISC) + inst_h*EMR_UPLIFT)
srvls = GB_SCANNED * 0.005
print(f"instance-hours            : {inst_h:.2f}")
print(f"EMR on-demand             : \${od:.2f}")
print(f"EMR core-on-spot          : \${spot:.2f}   ({(1-spot/od)*100:.0f}% cheaper)")
print(f"serverless SQL (20 GB)    : \${srvls:.2f}")
print(f"forgotten for 7 days      : \${(CORE_NODES+PRIMARY)*24*7*(ON_DEMAND+EMR_UPLIFT):.2f}")
print(f"egress if pulled to laptop: \${GB_SCANNED*0.09:.2f}")
EOF
python3 ~/lab8/cost.py`,
        out:[['','instance-hours            : 3.75'],
             ['t','EMR on-demand             : $1.00'],
             ['g','EMR core-on-spot          : $0.56   (45% cheaper)'],
             ['v','serverless SQL (20 GB)    : $0.10'],
             ['r','forgotten for 7 days      : $225.12'],
             ['a','egress if pulled to laptop: $1.80']],
        fx:'cost' },
    ]
  },
  {
    id:'s8', num:8, title:'Measure the commit cost', eyebrow:'STEP 08',
    lede:'Write the same data as many small files, then as a few large ones, and compare. The gap is the rename-and-commit problem — invisible on HDFS, expensive on object storage.',
    teach:[
      {ic:'🐌',html:'Object stores have no atomic rename, so committing output <strong>copies then deletes</strong>. More files = more HTTP round-trips. This is the argument for <code>coalesce</code> before writing.'},
    ],
    cmds:[
      { id:'s8-commit', lbl:'Many files vs few files', code:
`# inside pyspark
import time
df = spark.read.parquet("s3a://bda-lake/curated/daily_rollup")
t = time.time()
df.repartition(200).write.mode("overwrite").parquet("s3a://bda-lake/tmp/many")
many = time.time() - t
t = time.time()
df.coalesce(4).write.mode("overwrite").parquet("s3a://bda-lake/tmp/few")
few = time.time() - t
print(f"200 files : {many:.1f}s")
print(f"  4 files : {few:.1f}s")
print(f"ratio     : {many/few:.1f}x")`,
        out:[['','200 files : 14.2s'],
             ['','  4 files : 3.6s'],
             ['a','ratio     : 3.9x'],
             ['d','on real S3 the gap is larger \u2014 every file is several requests']],
        fx:'commit', need:'curated' },
    ]
  },
  {
    id:'s9', num:9, title:'Write the real EMR command', eyebrow:'STEP 09',
    lede:'Write the launch command you would actually run — with the settings that matter: auto-termination, a log URI, the bootstrap action, the steps, and no public access. Reviewed, not executed.',
    teach:[
      {ic:'📝',html:'Annotate five lines in your report: <strong>why</strong> auto-terminate, core on-demand + task on spot, a private subnet, a log URI, and TERMINATE_CLUSTER on failure.'},
      {cls:'setup',ic:'🎬',html:'Then hit <strong>Simulate transient cluster</strong> below to watch the whole lifecycle — and the session-cost meter tick up, then stop the instant the cluster terminates.'},
    ],
    cmds:[
      { id:'s9-emr', lbl:'Create launch_emr.sh', tag:'review', code:
`cat > ~/lab8/launch_emr.sh <<'EOF'
#!/bin/bash   # NOT RUN HERE \u2014 reviewed, not executed
set -euo pipefail
BUCKET=my-real-bucket
aws emr create-cluster \\
  --name 'bda-daily-rollup' --release-label emr-7.1.0 \\
  --applications Name=Spark Name=Hadoop \\
  --instance-groups \\
     InstanceGroupType=MASTER,InstanceCount=1,InstanceType=m5.xlarge \\
     InstanceGroupType=CORE,InstanceCount=2,InstanceType=m5.xlarge \\
     InstanceGroupType=TASK,InstanceCount=2,InstanceType=m5.xlarge,BidPrice=OnDemandPrice \\
  --ec2-attributes SubnetId=subnet-private-123,KeyName=none \\
  --service-role EMR_DefaultRole --job-flow-role EMR_EC2_DefaultRole \\
  --log-uri s3://\$BUCKET/emr-logs/ \\
  --bootstrap-actions Path=s3://\$BUCKET/scripts/bootstrap.sh,Name=deps \\
  --auto-terminate \\
  --steps Type=Spark,Name=rollup,ActionOnFailure=TERMINATE_CLUSTER,\\
Args=[--deploy-mode,cluster,s3://\$BUCKET/scripts/daily_rollup.py,s3://\$BUCKET/raw/events/,s3://\$BUCKET/curated/daily_rollup]
EOF
chmod +x ~/lab8/launch_emr.sh`,
        out:[['t','written ~/lab8/launch_emr.sh'],
             ['a','not executed \u2014 this is the artefact you submit for review']], fx:'mk-emr' },
    ],
    action:{ id:'sim-cluster', label:'🎬  Simulate transient cluster', fn:'simulateCluster' }
  },
  {
    id:'s10', num:10, title:'Write the HDInsight equivalent', eyebrow:'STEP 10',
    lede:'Azure names things differently but the shape is identical: a storage account with ADLS Gen2 replaces the bucket, and a managed identity replaces the instance role. Writing both is the point.',
    teach:[
      {ic:'☁️',html:'HDInsight has <strong>no <code>--auto-terminate</code></strong>. You must delete the cluster yourself — forgetting is entirely your problem, and your bill.'},
    ],
    cmds:[
      { id:'s10-hdi', lbl:'Create launch_hdinsight.sh', tag:'review', code:
`cat > ~/lab8/launch_hdinsight.sh <<'EOF'
#!/bin/bash   # NOT RUN HERE
set -euo pipefail
RG=bda-rg; ST=bdalakestore; CL=bda-spark
az storage account create -n \$ST -g \$RG --sku Standard_LRS --hns true
az storage fs create -n lake --account-name \$ST
az hdinsight create --name \$CL --resource-group \$RG --type spark --version 5.1 \\
  --storage-account \$ST --storage-container lake \\
  --assign-identity bda-managed-identity \\
  --headnode-size Standard_D4_v2 --workernode-size Standard_D4_v2 \\
  --workernode-count 3 --vnet-name bda-vnet --subnet private-subnet
az hdinsight application create --cluster-name \$CL --resource-group \$RG \\
  --name rollup --script-uri abfss://lake@\$ST.dfs.core.windows.net/scripts/daily_rollup.py
az hdinsight delete --name \$CL --resource-group \$RG --yes
EOF`,
        out:[['t','written ~/lab8/launch_hdinsight.sh'],
             ['d','── mapping ──────────────────────────────'],
             ['','S3 bucket        \u2192 ADLS Gen2 container (hns=true)'],
             ['','s3a://           \u2192 abfss://'],
             ['','instance profile \u2192 managed identity'],
             ['r','--auto-terminate \u2192 no equivalent; delete it yourself']], fx:'mk-hdi' },
    ]
  },
  {
    id:'s11', num:11, title:'Remove every credential from disk', eyebrow:'STEP 11',
    lede:'The MinIO keys in s3.conf were a lab convenience. On a real cluster there must be no keys anywhere — the instance role supplies temporary credentials automatically. This diff is the deliverable.',
    teach:[
      {ic:'🔒',html:'A leaked long-lived key works until someone notices and revokes it. A leaked instance-role <strong>session</strong> expires on its own in hours. That difference is the whole point.'},
    ],
    cmds:[
      { id:'s11-prod', lbl:'Create s3-prod.conf & diff', code:
`cat > ~/lab8/s3-prod.conf <<'EOF'
spark.hadoop.fs.s3a.aws.credentials.provider \\
  com.amazonaws.auth.InstanceProfileCredentialsProvider
spark.hadoop.fs.s3a.connection.maximum       128
spark.hadoop.fs.s3a.fast.upload              true
spark.hadoop.fs.s3a.committer.name           magic
spark.sql.parquet.output.committer.class \\
  org.apache.spark.internal.io.cloud.BindingParquetOutputCommitter
EOF
diff ~/lab8/s3.conf ~/lab8/s3-prod.conf`,
        out:[['r','< spark.hadoop.fs.s3a.endpoint        http://localhost:9000'],
             ['r','< spark.hadoop.fs.s3a.access.key      minioadmin'],
             ['r','< spark.hadoop.fs.s3a.secret.key      minioadmin'],
             ['g','> spark.hadoop.fs.s3a.committer.name  magic'],
             ['g','> spark.sql.parquet.output.committer.class  ...BindingParquetOutputCommitter'],
             ['d','removed: endpoint + 2 long-lived keys  ·  added: the S3A magic committer']], fx:'creds' },
    ]
  },
  {
    id:'s12', num:12, title:'Clean up & write the comparison', eyebrow:'STEP 12',
    lede:'Remove the temporary objects — in a real account they cost money every month until deleted. Then write the comparison this whole lab exists to produce.',
    teach:[
      {ic:'🧹',html:'Orphaned scratch data is one of the largest lines on a typical cloud bill. Deleting <code>tmp/</code> and stopping the cluster are the two habits that keep costs honest.'},
    ],
    cmds:[
      { id:'s12-clean', lbl:'Remove tmp/ & summarize', code:
`s3 rm --recursive s3://bda-lake/tmp/
s3 ls --recursive s3://bda-lake/ --summarize | tail -3`,
        out:[['','delete: s3://bda-lake/tmp/many/ (200 objects)'],
             ['','delete: s3://bda-lake/tmp/few/ (4 objects)'],
             ['d','Total Objects: 7'],
             ['t','Total Size: 1.1 GiB']], fx:'clean', need:'minio' },
      { id:'s12-stop', lbl:'Stop Spark & MinIO', code:`spark.stop(); exit()\ndocker stop bda-minio`,
        out:[['d','Spark session stopped'],
             ['t','bda-minio'],
             ['g','environment down \u2014 bill stops here']], fx:'shutdown' },
    ],
    deliverable:true
  },
];

/** Setup items first, then the numbered steps — the nav order. */
BDA.data.ALL = BDA.data.SETUP.concat(BDA.data.STEPS);

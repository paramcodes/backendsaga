import type { Incident } from "../schema";

/**
 * Worked scenarios. Each one is a composite of outages that happen constantly
 * in production, written so the symptoms come first and the cause is only
 * confirmed at the end — the order a real investigation runs in.
 *
 * `rootCauseId` is never read by the diagnosis engine. It is the answer key.
 */
export const incidents: Incident[] = [
  {
    id: "checkout-lock-storm",
    slug: "checkout-lock-storm",
    title: "Checkout latency tripled after a routine migration",
    severity: "SEV2",
    summary:
      "An ALTER TABLE ran inside a long-lived transaction during business hours. Checkout latency tripled; the deploy that 'caused' it was innocent.",
    narrative:
      "A data-fix script opened a transaction, updated 400k rows, and then waited on an interactive confirmation prompt nobody was watching. The transaction stayed open for eleven minutes. During that window every write to the same table queued behind its locks, checkout requests held their database connections while they waited, and the pool drained. Because the pool was empty, requests that had nothing to do with checkout also started waiting, which made the whole API look slow and sent the on-call team hunting for a deploy.",
    symptomIds: [
      "p99-latency-up",
      "db-latency-up",
      "lock-waits-up",
      "pool-wait-up",
      "idle-in-transaction",
      "timeouts-up",
    ],
    timeline: [
      { at: "14:02", note: "Data-fix script starts; it opens a transaction and stops at a prompt." },
      { at: "14:05", note: "Lock waits appear on the orders table.", symptomId: "lock-waits-up" },
      { at: "14:06", note: "Checkout p95 doubles, p99 triples.", symptomId: "p99-latency-up" },
      { at: "14:07", note: "Pool wait time passes one second; unrelated endpoints slow down.", symptomId: "pool-wait-up" },
      { at: "14:09", note: "Clients start timing out and users retry by hand.", symptomId: "timeouts-up" },
      { at: "14:11", note: "Someone looks at pg_stat_activity and finds one session idle in transaction.", symptomId: "idle-in-transaction" },
      { at: "14:13", note: "The session is terminated. Latency returns to baseline within thirty seconds." },
    ],
    rootCauseId: "long-transaction",
    contributingIds: ["lock-contention", "connection-pool-exhaustion", "missing-timeout"],
    resolution:
      "Terminated the blocking session, then moved the script to a batched job with a statement timeout and a lock timeout, run outside peak hours.",
    lesson:
      "A transaction is a lock holder for its entire lifetime, not just while a statement runs. The most dangerous line in a migration script is the one that waits for a human.",
  },
  {
    id: "homepage-stampede",
    slug: "homepage-stampede",
    title: "The homepage fell over every hour, on the hour",
    severity: "SEV1",
    summary:
      "One cached fragment with a one-hour TTL expired for every node at the same second. Each expiry produced a thousand identical recomputations.",
    narrative:
      "The homepage rendered from a cached fragment with a fixed one-hour TTL set at deploy time, so every application node expired it in the same second. At each expiry, every in-flight request missed, every miss recomputed the same expensive aggregate, and the database saw a thousand copies of one query. The pool emptied, response times spiked for ninety seconds, and then the cache refilled and everything looked healthy again — which is why three on-call shifts had dismissed it as 'a blip'.",
    symptomIds: [
      "origin-load-spike",
      "cache-hit-drop",
      "pool-wait-up",
      "p99-latency-up",
      "error-rate-up",
    ],
    timeline: [
      { at: "T+0s", note: "The cached fragment expires on every node simultaneously.", symptomId: "cache-hit-drop" },
      { at: "T+1s", note: "Origin request rate jumps from 40/s to 1,100/s.", symptomId: "origin-load-spike" },
      { at: "T+3s", note: "Every connection in the pool is checked out.", symptomId: "pool-wait-up" },
      { at: "T+8s", note: "p99 crosses ten seconds; load balancer health checks start failing.", symptomId: "p99-latency-up" },
      { at: "T+20s", note: "5xx rate peaks at 12% as requests exceed their deadline.", symptomId: "error-rate-up" },
      { at: "T+90s", note: "The first recomputation finishes, the cache refills, traffic returns to normal." },
    ],
    rootCauseId: "cache-stampede",
    contributingIds: ["thundering-herd", "connection-pool-exhaustion", "cold-cache"],
    resolution:
      "Added single-flight coalescing around the recomputation, jittered the TTL by ±10%, and served the stale value while the refresh ran.",
    lesson:
      "Synchronised expiry turns a cache into a scheduled load test against your database. Spread the deadlines and let one request do the work.",
  },
  {
    id: "retry-amplified-outage",
    slug: "retry-amplified-outage",
    title: "A three-second blip became a forty-minute outage",
    severity: "SEV1",
    summary:
      "A dependency hiccuped for three seconds. Clients retried immediately, without jitter, and the retries kept the dependency down long after the original fault cleared.",
    narrative:
      "A downstream payment service dropped requests for three seconds during a node replacement. Three layers of clients — the SDK, the service's own HTTP wrapper, and the job runner — each retried three times with no backoff, so one user request became up to 27 attempts. Offered load multiplied roughly eightfold and stayed there. The dependency recovered its node in seconds but never got a quiet moment to catch up; queues grew, deadlines expired, and the retries continued because every timeout looked like a reason to try again.",
    symptomIds: [
      "retry-rate-up",
      "error-rate-up",
      "queue-depth-up",
      "pool-wait-up",
      "timeouts-up",
    ],
    timeline: [
      { at: "09:14", note: "Payment node is replaced; requests fail for three seconds." },
      { at: "09:14", note: "Retry rate goes from 0.4% of traffic to 31%.", symptomId: "retry-rate-up" },
      { at: "09:15", note: "Queue depth climbs and stops draining.", symptomId: "queue-depth-up" },
      { at: "09:17", note: "Error rate holds at 20% even though the original fault is over.", symptomId: "error-rate-up" },
      { at: "09:22", note: "Connection pools on three services are saturated.", symptomId: "pool-wait-up" },
      { at: "09:41", note: "Retries are disabled by feature flag; load halves within a minute." },
      { at: "09:54", note: "Backoff with jitter is re-enabled; the system stays stable." },
    ],
    rootCauseId: "retry-storm",
    contributingIds: ["cascading-failure", "missing-timeout", "queue-buildup"],
    resolution:
      "Collapsed retries to a single layer with exponential backoff and full jitter, added a retry budget of 10% of traffic, and put a circuit breaker in front of the dependency.",
    lesson:
      "Retries are load multiplication. Without jitter, a budget, and a breaker, the recovery mechanism becomes the outage.",
  },
  {
    id: "afternoon-gc-spiral",
    slug: "afternoon-gc-spiral",
    title: "Latency climbed all afternoon and a restart fixed it",
    severity: "SEV3",
    summary:
      "A per-request cache with no eviction retained its entries for the life of the process. Collections grew longer every hour until the pod was killed.",
    narrative:
      "A memoisation map keyed by request id was added to speed up a serialiser. Nothing ever removed entries, so the live set grew with traffic. Each full collection had more to trace and less to reclaim, so pauses stretched from 40ms to 900ms over about six hours. Latency looked like a traffic problem until someone plotted heap-after-collection and saw a staircase that never came back down — followed, every evening, by an OOM kill and an automatic restart that reset the graph.",
    symptomIds: ["memory-climbing", "gc-pauses-up", "p99-latency-up", "restart-loop"],
    timeline: [
      { at: "11:00", note: "Heap after full collection sits at 1.1 GB — normal." },
      { at: "14:00", note: "Heap after collection is 2.4 GB and still climbing.", symptomId: "memory-climbing" },
      { at: "15:30", note: "Collection pauses pass 400ms; p99 follows them exactly.", symptomId: "gc-pauses-up" },
      { at: "16:10", note: "CPU time in the collector reaches 35% of the quota." },
      { at: "17:20", note: "p99 is 4x baseline and tracks the pause graph exactly.", symptomId: "p99-latency-up" },
      { at: "17:45", note: "The pod is OOM-killed and restarts clean — the third evening in a row.", symptomId: "restart-loop" },
    ],
    rootCauseId: "memory-leak",
    contributingIds: ["heap-pressure", "gc-pause", "hot-path-allocation"],
    resolution:
      "Replaced the unbounded map with a size-bounded LRU scoped to the request, and alerted on heap-after-collection rather than on total memory.",
    lesson:
      "A leak shows up as latency long before it shows up as an out-of-memory kill. The signal is the floor after collection, not the peak.",
  },
  {
    id: "report-plan-regression",
    slug: "report-plan-regression",
    title: "Reports timed out after an ordinary data load",
    severity: "SEV2",
    summary:
      "A nightly import shifted the statistics on one column. The planner swapped an index scan for a sequential scan and a 40ms query became 19 seconds.",
    narrative:
      "Nothing shipped. The nightly import added two million rows to a table whose most selective column suddenly looked unselective to the planner. The next morning the same report query — same SQL, same parameters — chose a sequential scan with a filter. Disk reads on the database host went up tenfold, the page cache started evicting working data, and report requests held connections long enough to starve the rest of the application.",
    symptomIds: ["db-latency-up", "disk-io-up", "timeouts-up", "pool-wait-up"],
    timeline: [
      { at: "02:30", note: "Nightly import completes; row counts and statistics change." },
      { at: "08:05", note: "Report query mean execution time jumps from 40ms to 19s.", symptomId: "db-latency-up" },
      { at: "08:06", note: "Database host read throughput goes from 30 MB/s to 400 MB/s.", symptomId: "disk-io-up" },
      { at: "08:12", note: "Report endpoints exceed their 15s deadline.", symptomId: "timeouts-up" },
      { at: "08:20", note: "Connections held by reports starve unrelated endpoints.", symptomId: "pool-wait-up" },
      { at: "08:48", note: "EXPLAIN on the slow query shows Seq Scan where an index scan used to be." },
    ],
    rootCauseId: "query-plan-regression",
    contributingIds: ["full-table-scan", "page-cache-thrashing", "missing-index"],
    resolution:
      "Ran ANALYZE on the imported table, added a covering index for the report predicate, and started recording plan hashes per query id so a change is visible before users find it.",
    lesson:
      "A query can get ten times slower with no code change. Track plans, not just durations.",
  },
  {
    id: "noisy-neighbour-throttle",
    slug: "noisy-neighbour-throttle",
    title: "Same code, same traffic, double the latency on two pods",
    severity: "SEV3",
    summary:
      "Two replicas out of twenty were slow. They shared a node with a batch job that burned every spare core on the host.",
    narrative:
      "Latency per replica was bimodal: eighteen pods at 120ms p99, two at 260ms. The slow pods had identical code, identical configuration and the same share of traffic. Their cgroup showed throttled periods every scheduling window even though their own CPU usage was below the limit they had been given — the host itself was saturated by an unrelated batch job, and steal time on those two pods was 18%.",
    symptomIds: ["cpu-saturated", "p99-latency-up", "gc-pauses-up", "threadpool-queueing"],
    timeline: [
      { at: "Day 1", note: "A batch workload is scheduled onto the same nodes as the API." },
      { at: "Day 1", note: "Two API pods show throttled periods every second.", symptomId: "cpu-saturated" },
      { at: "Day 1", note: "p99 on those two pods doubles; the other eighteen are unchanged.", symptomId: "p99-latency-up" },
      { at: "Day 2", note: "Collector threads on the slow pods are descheduled mid-pause.", symptomId: "gc-pauses-up" },
      { at: "Day 2", note: "Worker queue depth rises on the slow pods only.", symptomId: "threadpool-queueing" },
      { at: "Day 3", note: "Steal time of 18% is spotted; the batch job is moved to its own node pool." },
    ],
    rootCauseId: "noisy-neighbor",
    contributingIds: ["cpu-throttling", "gc-pause", "thread-pool-starvation"],
    resolution:
      "Moved the batch workload to a dedicated node pool, set CPU requests equal to limits for latency-sensitive pods, and added steal time and throttled-period panels to the service dashboard.",
    lesson:
      "Per-replica dashboards exist for this. An average across twenty pods hides the two that are being starved by a neighbour.",
  },
  {
    id: "keepalive-regression",
    slug: "keepalive-regression",
    title: "A keep-alive setting change exhausted the gateway's file descriptors",
    severity: "SEV2",
    summary:
      "A proxy upgrade reset connection reuse to off. Every request opened a new TLS connection, and sockets in TIME_WAIT consumed the descriptor limit.",
    narrative:
      "A routine proxy upgrade dropped a non-default keep-alive setting. Connection reuse fell from 98% to near zero, so each request paid a full TCP and TLS handshake. CPU on the gateway rose from handshake cryptography, TIME_WAIT sockets accumulated at several thousand per second, and within forty minutes the process hit its open-file limit and began refusing connections outright.",
    symptomIds: [
      "connection-churn-up",
      "fd-exhaustion-errors",
      "p99-latency-up",
      "error-rate-up",
      "cpu-saturated",
    ],
    timeline: [
      { at: "10:30", note: "Proxy is upgraded; keep-alive defaults to off." },
      { at: "10:32", note: "New connections per second rise from 90 to 4,200.", symptomId: "connection-churn-up" },
      { at: "10:35", note: "p99 rises by the cost of a handshake on every request.", symptomId: "p99-latency-up" },
      { at: "10:48", note: "Gateway CPU is dominated by TLS routines.", symptomId: "cpu-saturated" },
      { at: "11:10", note: "EMFILE appears in the gateway log; connections are refused.", symptomId: "fd-exhaustion-errors" },
      { at: "11:12", note: "Error rate crosses 30%.", symptomId: "error-rate-up" },
      { at: "11:25", note: "Keep-alive is restored; descriptors drain as TIME_WAIT sockets expire." },
    ],
    rootCauseId: "connection-churn",
    contributingIds: ["tls-handshake-cost", "fd-exhaustion", "cascading-failure"],
    resolution:
      "Restored keep-alive with an explicit idle timeout and max-requests-per-connection, raised the descriptor limit, and added connection reuse ratio to the gateway dashboard.",
    lesson:
      "Connection reuse is a performance feature and a capacity feature. When it disappears you pay in CPU, latency and file descriptors at once.",
  },
  {
    id: "show-all-page",
    slug: "show-all-page",
    title: "A 'show all' button took down the API",
    severity: "SEV3",
    summary:
      "A new admin view removed pagination and lazy-loaded a relation per row. Fifty rows became four thousand queries and a 60 MB response.",
    narrative:
      "An internal 'show all orders' view shipped without a page size. For the largest tenant it returned 40,000 rows, and the serialiser touched a lazily-loaded relation on each one, so the request issued one query per row. A single click held a database connection for ninety seconds, issued tens of thousands of statements and produced a response large enough to force the application into repeated collections. Three admins clicking it at once was enough to saturate the pool for everyone.",
    symptomIds: [
      "slow-request-fanout",
      "oversized-responses",
      "db-latency-up",
      "pool-wait-up",
      "p99-latency-up",
    ],
    timeline: [
      { at: "16:20", note: "Admin view is released to internal users." },
      { at: "16:41", note: "Traces show 4,000+ database spans inside one request.", symptomId: "slow-request-fanout" },
      { at: "16:42", note: "Response body size for the endpoint averages 60 MB.", symptomId: "oversized-responses" },
      { at: "16:44", note: "Database operation count per request rises 80x.", symptomId: "db-latency-up" },
      { at: "16:47", note: "Pool is fully checked out by three concurrent admin requests.", symptomId: "pool-wait-up" },
      { at: "16:49", note: "Customer-facing p99 doubles.", symptomId: "p99-latency-up" },
    ],
    rootCauseId: "missing-pagination",
    contributingIds: ["n-plus-one", "unbounded-query", "connection-pool-exhaustion"],
    resolution:
      "Added keyset pagination with a hard maximum page size, batched the relation into a single query, and set a statement timeout on the admin role.",
    lesson:
      "Internal endpoints share the database with customers. 'It is only for admins' is not a capacity argument.",
  },
  {
    id: "vanishing-writes",
    slug: "vanishing-writes",
    title: "Users saw their own writes disappear",
    severity: "SEV3",
    summary:
      "Reads were routed to a replica that was eleven seconds behind, so a record created a moment earlier was not there yet.",
    narrative:
      "A read-scaling change sent all GET traffic to replicas. During a bulk import the primary generated far more write-ahead log than usual and replica apply fell eleven seconds behind. The create-then-redirect flow in the product reads the record it just wrote, so users were redirected to a 404 for their own data, then found the record present on refresh — the kind of bug that cannot be reproduced on a quiet system.",
    symptomIds: ["replica-stale-reads", "stale-data-reads", "db-latency-up"],
    timeline: [
      { at: "13:00", note: "Bulk import starts on the primary." },
      { at: "13:04", note: "Replication lag passes four seconds.", symptomId: "replica-stale-reads" },
      { at: "13:06", note: "Support reports 'record not found' immediately after creation.", symptomId: "stale-data-reads" },
      { at: "13:10", note: "Replica apply is single-threaded and now eleven seconds behind.", symptomId: "db-latency-up" },
      { at: "13:35", note: "Import finishes; lag drains and the reports stop." },
    ],
    rootCauseId: "replication-lag",
    contributingIds: ["write-amplification", "long-transaction"],
    resolution:
      "Pinned read-your-write flows to the primary for a short window after a write, throttled the import, and alerted on lag in seconds rather than bytes.",
    lesson:
      "Read replicas change the consistency model of your application. Any flow that reads what it just wrote needs an explicit rule.",
  },
  {
    id: "zone-packet-loss",
    slug: "zone-packet-loss",
    title: "One availability zone, two percent packet loss",
    severity: "SEV2",
    summary:
      "A failing link caused retransmits between two zones. Latency was fine at the median and terrible at the tail, and retries hid the cause.",
    narrative:
      "Cross-zone traffic started losing about two percent of segments. TCP recovered every loss, so nothing failed outright — but each recovery cost a retransmission timeout, and because the services multiplexed many streams over one connection, a single lost segment delayed every stream on it. The median was untouched. The 99th percentile went from 180ms to 2.4 seconds, application-level retries doubled the offered load, and the dashboards for both services looked healthy from the inside.",
    symptomIds: ["packet-loss", "p99-latency-up", "retry-rate-up", "timeouts-up"],
    timeline: [
      { at: "21:40", note: "Retransmit counters rise on hosts in one zone only.", symptomId: "packet-loss" },
      { at: "21:42", note: "p99 for cross-zone calls goes from 180ms to 2.4s while p50 is unchanged.", symptomId: "p99-latency-up" },
      { at: "21:50", note: "Application retries double the request rate to that zone.", symptomId: "retry-rate-up" },
      { at: "22:05", note: "Requests begin exceeding their one-second deadline.", symptomId: "timeouts-up" },
      { at: "22:30", note: "Traffic is drained from the zone; the provider later confirms a failing link." },
    ],
    rootCauseId: "tcp-retransmits",
    contributingIds: ["head-of-line-blocking", "retry-storm", "tail-latency"],
    resolution:
      "Drained the zone, then added per-zone latency and retransmit panels and a hedged request for the few read paths that could tolerate duplicates.",
    lesson:
      "A clean median with a ruined tail is a network story until proven otherwise. Measure by zone, by node, by connection — never only in aggregate.",
  },
];

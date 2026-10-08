import type { Symptom, SymptomEvidence } from "../schema";

const s = (
  id: string,
  name: string,
  layerId: string,
  signal: string,
  trend: Symptom["trend"],
  description: string,
): Symptom => ({ id, name, layerId, signal, trend, description });

/**
 * Observations, not diagnoses. Every entry here is phrased the way it appears
 * on a dashboard at 03:00 — no cause named, no mechanism assumed.
 */
export const symptoms: Symptom[] = [
  s("p99-latency-up", "API p99 latency up", "api",
    "http.server.request.duration p99", "UP",
    "The slow end of the distribution moved while the median barely did."),
  s("error-rate-up", "5xx error rate climbing", "api",
    "http.server.request.count{status_code>=500}", "UP",
    "Requests are failing outright, not just slowly, and the rate is still rising."),
  s("timeouts-up", "Client timeouts firing", "api",
    "deadline exceeded / context canceled", "UP",
    "Callers are giving up on requests before the server answers."),
  s("retry-rate-up", "Retry rate climbing", "api",
    "http.request.resend_count", "UP",
    "A growing share of traffic is a second or third attempt at the same work."),
  s("rate-limit-429s", "429s being returned", "api",
    "http.server.request.count{status_code=429}", "UP",
    "The service is refusing requests on purpose, by policy."),
  s("oversized-responses", "Response payloads growing", "application",
    "http.server.response.body.size", "UP",
    "Responses are larger than they were, without a deliberate API change."),
  s("slow-request-fanout", "Many downstream calls per request", "application",
    "client spans per server span", "UP",
    "One inbound request now produces a crowd of outbound calls."),
  s("db-latency-up", "Database query latency up", "data",
    "db.client.operation.duration p95", "UP",
    "The database is taking longer per statement, with request volume unchanged."),
  s("pool-wait-up", "Connection pool wait time up", "data",
    "db.client.connection.pending_requests", "UP",
    "Work is queuing to get a database connection before any query runs."),
  s("lock-waits-up", "Lock waits in the database", "data",
    "pg_locks where granted = false", "UP",
    "Statements are blocked waiting for a lock another session holds."),
  s("deadlock-errors", "Deadlock errors in the log", "data",
    "pg_stat_database.deadlocks", "UP",
    "The database is aborting transactions to break cycles."),
  s("idle-in-transaction", "Sessions idle in transaction", "data",
    "max(now() - xact_start)", "UP",
    "Transactions are open far longer than the statements inside them take."),
  s("replica-stale-reads", "Replicas behind the primary", "data",
    "replication lag in seconds", "UP",
    "A read replica is serving data the primary already moved past."),
  s("stale-data-reads", "Users see stale data after a write", "caching",
    "stale read detected / version mismatch", "PRESENT",
    "A value that was just written reads back as the old one."),
  s("cache-hit-drop", "Cache hit ratio dropped", "caching",
    "cache hit ratio", "DOWN",
    "A larger share of reads is missing the cache than yesterday."),
  s("origin-load-spike", "Origin request spike", "caching",
    "origin request rate", "SPIKE",
    "Traffic behind the cache jumped in a step, often at a round-numbered time."),
  s("single-shard-hot", "One node hotter than its peers", "caching",
    "ops per key / per shard", "UP",
    "Identical replicas, wildly different load on one of them."),
  s("memory-climbing", "Memory use climbing", "runtime",
    "heap used after full collection", "UP",
    "The live set grows between collections and never returns to its old floor."),
  s("restart-loop", "Processes restarting on a cadence", "runtime",
    "OOMKilled / exit code 137", "PRESENT",
    "The process is killed and replaced on a schedule nobody wrote."),
  s("gc-pauses-up", "Garbage-collection pauses lengthening", "runtime",
    "process.runtime.gc.duration", "SPIKE",
    "Collections are longer, more frequent, or both."),
  s("threadpool-queueing", "Worker pool queueing", "runtime",
    "executor queue depth", "UP",
    "Work waits for a worker before it starts running."),
  s("event-loop-lag", "Event loop lag spikes", "runtime",
    "event loop lag", "SPIKE",
    "The loop is late returning to the queue; everything on it is delayed."),
  s("cpu-saturated", "CPU pinned or throttled", "os",
    "cgroup cpu.stat nr_throttled", "UP",
    "The process is hitting its CPU ceiling, whether it owns it or not."),
  s("disk-io-up", "Disk read throughput up", "os",
    "major page faults / read IOPS", "UP",
    "Physical reads rose while the logical read rate stayed flat."),
  s("fd-exhaustion-errors", "Too many open files", "os",
    "EMFILE / open fds vs RLIMIT_NOFILE", "PRESENT",
    "The process cannot open another socket or file."),
  s("packet-loss", "TCP retransmits rising", "network",
    "TcpRetransSegs", "UP",
    "Segments are being sent twice; something between the hosts is dropping them."),
  s("dns-slow", "DNS resolution slow or failing", "network",
    "DNS resolution span duration", "SPIKE",
    "Name lookups take hundreds of milliseconds or fail intermittently."),
  s("connection-churn-up", "New connections per second climbing", "network",
    "sockets in TIME_WAIT / connects per second", "UP",
    "Connections are being opened and closed rather than reused."),
  s("queue-depth-up", "Queue depth and age growing", "distributed",
    "queue depth, oldest message age", "UP",
    "Producers are outpacing consumers and the backlog is not draining."),
];

const link = (
  symptomId: string,
  strength: SymptomEvidence["strength"],
  ...evidenceIds: string[]
): SymptomEvidence[] => evidenceIds.map((evidenceId) => ({ symptomId, evidenceId, strength }));

/**
 * Symptom -> evidence -> concept. This is the only bridge between an
 * observation and the graph: a symptom never points at a concept directly, so
 * every diagnosis can be read back as "this signal, on this card, on this
 * concept".
 */
export const symptomEvidence: SymptomEvidence[] = [
  ...link("p99-latency-up", "DIRECT", "ev-tail-ratio", "ev-tail-slowest"),
  ...link("p99-latency-up", "SUPPORTING", "ev-holb-queue"),

  ...link("error-rate-up", "DIRECT", "ev-cascade-spread"),
  ...link("error-rate-up", "SUPPORTING", "ev-cascade-saturation", "ev-shed-count"),

  ...link("timeouts-up", "DIRECT", "ev-timeout-span", "ev-timeout-threads"),
  ...link("timeouts-up", "SUPPORTING", "ev-pool-timeout-log"),

  ...link("retry-rate-up", "DIRECT", "ev-retry-log", "ev-retry-metric"),
  ...link("retry-rate-up", "SUPPORTING", "ev-hedge-duplicates", "ev-backoff-spacing"),

  ...link("rate-limit-429s", "DIRECT", "ev-ratelimit-429"),
  ...link("rate-limit-429s", "SUPPORTING", "ev-shed-count"),

  ...link("oversized-responses", "DIRECT", "ev-pagination-size", "ev-unbounded-rows"),
  ...link("oversized-responses", "SUPPORTING", "ev-pagination-deep", "ev-unbounded-oom"),

  ...link("slow-request-fanout", "DIRECT", "ev-fanout-trace", "ev-fanout-dependency"),
  ...link("slow-request-fanout", "SUPPORTING", "ev-n1-trace", "ev-n1-metric"),

  ...link("db-latency-up", "DIRECT", "ev-plan-steptime"),
  ...link("db-latency-up", "SUPPORTING", "ev-index-seqscan", "ev-scan-io", "ev-lock-counter"),

  ...link("pool-wait-up", "DIRECT", "ev-pool-metric", "ev-pool-wait", "ev-pool-timeout-log"),
  ...link("pool-wait-up", "SUPPORTING", "ev-pooler-saturation"),

  ...link("lock-waits-up", "DIRECT", "ev-lock-counter", "ev-lock-wait-log"),
  ...link("lock-waits-up", "SUPPORTING", "ev-deadlock-rate"),

  ...link("deadlock-errors", "DIRECT", "ev-deadlock-log", "ev-deadlock-rate"),

  ...link("idle-in-transaction", "DIRECT", "ev-longtx-age", "ev-longtx-idle"),

  ...link("replica-stale-reads", "DIRECT", "ev-replag-seconds"),
  ...link("replica-stale-reads", "SUPPORTING", "ev-writeamp-wal", "ev-replag-readback"),

  ...link("stale-data-reads", "DIRECT", "ev-invalidation-stale"),
  ...link("stale-data-reads", "SUPPORTING", "ev-replag-readback"),

  ...link("cache-hit-drop", "DIRECT", "ev-coldcache-ratio"),
  ...link("cache-hit-drop", "SUPPORTING", "ev-stampede-origin"),

  ...link("origin-load-spike", "DIRECT", "ev-stampede-origin", "ev-stampede-dup"),
  ...link("origin-load-spike", "SUPPORTING", "ev-herd-spike", "ev-herd-recovery", "ev-coalescing-origin"),

  ...link("single-shard-hot", "DIRECT", "ev-hotkey-ops", "ev-hotkey-cpu"),
  ...link("single-shard-hot", "SUPPORTING", "ev-noisy-variance"),

  ...link("memory-climbing", "DIRECT", "ev-heap-pressure", "ev-heap-rss"),
  ...link("memory-climbing", "SUPPORTING", "ev-leak-profile", "ev-leak-restart"),

  ...link("gc-pauses-up", "DIRECT", "ev-gc-metric", "ev-gc-frequency"),

  ...link("restart-loop", "DIRECT", "ev-leak-restart"),
  ...link("restart-loop", "SUPPORTING", "ev-unbounded-oom", "ev-heap-rss"),

  ...link("threadpool-queueing", "DIRECT", "ev-threadpool-queue", "ev-threadpool-wait"),
  ...link("threadpool-queueing", "SUPPORTING", "ev-bulkhead-isolation", "ev-asyncio-density"),

  ...link("event-loop-lag", "DIRECT", "ev-eventloop-lag", "ev-eventloop-profile"),

  ...link("cpu-saturated", "DIRECT", "ev-throttle-os", "ev-throttle-latency"),
  ...link("cpu-saturated", "SUPPORTING", "ev-ctxsw-rate", "ev-ctxsw-runqueue", "ev-noisy-steal"),

  ...link("disk-io-up", "DIRECT", "ev-pagecache-faults", "ev-pagecache-io"),
  ...link("disk-io-up", "SUPPORTING", "ev-scan-io"),

  ...link("fd-exhaustion-errors", "DIRECT", "ev-fd-log", "ev-fd-counter"),

  ...link("packet-loss", "DIRECT", "ev-retx-packet", "ev-retx-os"),
  ...link("packet-loss", "SUPPORTING", "ev-holb-queue"),

  ...link("dns-slow", "DIRECT", "ev-dns-span", "ev-dns-log"),

  ...link("connection-churn-up", "DIRECT", "ev-churn-timewait", "ev-churn-rate"),
  ...link("connection-churn-up", "SUPPORTING", "ev-tls-span", "ev-tls-cpu", "ev-keepalive-reuse"),

  ...link("queue-depth-up", "DIRECT", "ev-queue-depth", "ev-queue-ratio"),
  ...link("queue-depth-up", "SUPPORTING", "ev-backpressure-block"),
];

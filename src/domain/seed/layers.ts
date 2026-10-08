import type { Layer } from "../schema";

export const layers: Layer[] = [
  { id: "application", name: "Application", order: 1, description: "Code paths, ORMs and request handlers." },
  { id: "api", name: "API & Resilience", order: 2, description: "How services call each other and survive failure." },
  { id: "data", name: "Data", order: 3, description: "Databases, queries, transactions and replication." },
  { id: "caching", name: "Caching", order: 4, description: "Caches and the failure modes they introduce." },
  { id: "runtime", name: "Runtime", order: 5, description: "Memory management, threads and event loops." },
  { id: "network", name: "Network", order: 6, description: "TCP, TLS, DNS and connection behaviour." },
  { id: "os", name: "Operating System", order: 7, description: "Scheduler, kernel limits and resource isolation." },
  { id: "distributed", name: "Distributed Systems", order: 8, description: "System-wide dynamics across many services." },
];

import { createGraphIndex, domainGraph, incidentCatalog } from "../../src/domain";
import { createIncidentEngine } from "../../src/lib/incident-engine";
const engine = createIncidentEngine(createGraphIndex(domainGraph), incidentCatalog);
for (const incident of incidentCatalog.incidents) {
  const r = engine.replay(incident);
  const top = r.diagnosis.causes.slice(0, 3).map((c) => `${c.concept.id}(${c.coverage.length}/${c.score})`).join("  ");
  console.log(`${String(r.rootCauseRank).padStart(2)} | ${incident.slug.padEnd(26)} root=${incident.rootCauseId.padEnd(24)} top3: ${top}`);
}

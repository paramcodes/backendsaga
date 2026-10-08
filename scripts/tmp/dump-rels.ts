import { domainGraph } from "../../src/domain";
for (const r of domainGraph.relationships) console.log(`${r.sourceId} -${r.type}-> ${r.targetId}`);
console.log("total", domainGraph.relationships.length);

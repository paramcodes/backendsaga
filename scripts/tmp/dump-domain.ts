import { domainGraph } from "../../src/domain";
for (const l of domainGraph.layers) {
  console.log(`## ${l.id}`);
  for (const c of domainGraph.concepts.filter((x) => x.layerId === l.id)) {
    console.log(`  ${c.id} :: ${c.name}`);
  }
}
console.log("\n## evidence");
for (const e of domainGraph.evidence) {
  console.log(`${e.id} | ${e.conceptId} | ${e.kind} ${e.trend} | ${e.signal}`);
}

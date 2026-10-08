import { useMemo, useState } from "react";

import type { Layer, Symptom } from "@/domain";
import { EVIDENCE_TREND_META } from "@/lib/evidence-view";
import { groupSymptomsByLayer } from "@/lib/incident-view";
import { cn } from "@/lib/utils";

type Props = {
  symptoms: Symptom[];
  layers: Layer[];
  selected: string[];
  onToggle: (symptomId: string) => void;
  onClear: () => void;
};

/**
 * The only input the engine takes: what you have actually observed. Symptoms
 * are grouped by the layer the signal is read on, never by suspected cause —
 * naming the cause in the question would answer it.
 */
export function SymptomPicker({ symptoms, layers, selected, onToggle, onClear }: Props) {
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? symptoms.filter((symptom) =>
          `${symptom.name} ${symptom.signal} ${symptom.description}`.toLowerCase().includes(needle),
        )
      : symptoms;
    return groupSymptomsByLayer(matching, layers);
  }, [filter, layers, symptoms]);

  const chosen = new Set(selected);

  return (
    <section aria-label="Observed symptoms" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">What are you seeing?</p>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            Clear {selected.length}
          </button>
        )}
      </div>

      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter signals — latency, pool, retries…"
        aria-label="Filter symptoms"
        className="w-full border-b border-input bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No signal matches “{filter}”. Try a metric name, or clear the filter.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.layerId}>
              <p className="eyebrow mb-2 flex items-center gap-2">
                <span className={`layer-dot layer-${group.layerId}`} />
                {group.layerName}
              </p>
              <ul className="space-y-1.5">
                {group.symptoms.map((symptom) => {
                  const active = chosen.has(symptom.id);
                  const trend = EVIDENCE_TREND_META[symptom.trend];
                  return (
                    <li key={symptom.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onToggle(symptom.id)}
                        className="symptom-chip"
                        title={symptom.description}
                      >
                        <span aria-hidden className="symptom-chip-mark" />
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-2">
                            <span
                              className={cn(
                                "text-sm",
                                active ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {symptom.name}
                            </span>
                            <span
                              aria-hidden
                              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                            >
                              {trend.sign} {trend.label}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                            {symptom.signal}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

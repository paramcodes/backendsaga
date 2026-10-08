import { Link } from "@tanstack/react-router";

import type { Diagnosis, RankedCause } from "@/lib/incident-engine";
import { confidenceLabel, pathSentence } from "@/lib/incident-engine";
import { confidencePercent, coverageSummary } from "@/lib/incident-view";
import { cn } from "@/lib/utils";

type Props = {
  diagnosis: Diagnosis;
  /** Which candidate the chain canvas is drawing. */
  selectedId: string | null;
  onSelect: (conceptId: string) => void;
  /** How many candidates to show before the "show more" fold. */
  limit?: number;
  onShowMore?: (() => void) | undefined;
  hasMore?: boolean | undefined;
};

export function CauseList({
  diagnosis,
  selectedId,
  onSelect,
  limit = 5,
  onShowMore,
  hasMore,
}: Props) {
  const causes = diagnosis.causes.slice(0, limit);

  if (causes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to rank yet. Tick the signals you can actually see and the chain appears here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {causes.map((cause) => (
        <CauseCard
          key={cause.concept.id}
          cause={cause}
          diagnosis={diagnosis}
          selected={cause.concept.id === selectedId}
          onSelect={() => onSelect(cause.concept.id)}
        />
      ))}
      {hasMore && onShowMore && (
        <button
          onClick={onShowMore}
          className="w-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          Show more candidates
        </button>
      )}
    </div>
  );
}

function CauseCard({
  cause,
  diagnosis,
  selected,
  onSelect,
}: {
  cause: RankedCause;
  diagnosis: Diagnosis;
  selected: boolean;
  onSelect: () => void;
}) {
  const percent = confidencePercent(cause.confidence);
  const band = confidenceLabel(cause.confidence);

  return (
    <article
      className={cn(
        "border bg-card p-4 transition-colors md:p-5",
        selected ? "border-primary" : "border-border hover:border-foreground",
      )}
    >
      <header className="flex items-start gap-4">
        <span className="cause-rank" aria-hidden>
          {String(cause.rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-display text-xl leading-tight">
            <span className={`layer-dot layer-${cause.concept.layerId}`} />
            <button onClick={onSelect} className="text-left hover:text-primary">
              {cause.concept.name}
            </button>
          </h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {cause.layerName} · {coverageSummary(cause, diagnosis)} · {band.toLowerCase()} support
          </p>
        </div>
        <div className="w-24 flex-none text-right">
          <div className="font-display text-2xl leading-none">{percent}%</div>
          <div className="confidence-track mt-1.5">
            <div className="confidence-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </header>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {cause.concept.description}
      </p>

      <ol className="mt-4 space-y-2 border-t border-border pt-3">
        {cause.paths.slice(0, 4).map((path) => {
          const symptom = diagnosis.observations.find(
            (observation) => observation.symptom.id === path.symptomId,
          )?.symptom;
          return (
            <li key={`${path.symptomId}-${path.observedConceptId}`} className="text-sm">
              <span className="eyebrow mr-2 align-middle">
                {path.strength === "DIRECT" ? "Direct" : "Indirect"}
              </span>
              <span className="text-muted-foreground">
                {symptom ? `${symptom.name}: ` : ""}
                {pathSentence(path)}
                {path.steps.length > 0 ? "." : "."}
              </span>
            </li>
          );
        })}
        {cause.paths.length > 4 && (
          <li className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            +{cause.paths.length - 4} more chains
          </li>
        )}
      </ol>

      {(cause.mitigations.length > 0 || cause.predicted.length > 0) && (
        <div className="mt-4 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
          {cause.mitigations.length > 0 && (
            <div>
              <p className="eyebrow">If true, this helps</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cause.mitigations.map((concept, index) => (
                  <span key={concept.id}>
                    {index > 0 && ", "}
                    <Link
                      to="/concepts/$slug"
                      params={{ slug: concept.slug }}
                      className="hover:text-primary"
                    >
                      {concept.name}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          )}
          {cause.predicted.length > 0 && (
            <div>
              <p className="eyebrow">You should also start seeing</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cause.predicted.slice(0, 4).map((prediction, index) => (
                  <span key={prediction.concept.id}>
                    {index > 0 && ", "}
                    <Link
                      to="/concepts/$slug"
                      params={{ slug: prediction.concept.slug }}
                      className="hover:text-primary"
                    >
                      {prediction.concept.name}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-widest">
        <button
          onClick={onSelect}
          className={cn(
            "transition-colors",
            selected ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {selected ? "Shown on the chain" : "Draw this chain"}
        </button>
        <Link
          to="/concepts/$slug"
          params={{ slug: cause.concept.slug }}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Read the entry →
        </Link>
        <Link
          to="/graph"
          search={{ focus: cause.concept.id }}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Open in graph →
        </Link>
        {cause.unexplained.length > 0 && (
          <span className="text-muted-foreground">
            leaves {cause.unexplained.length} unexplained
          </span>
        )}
      </footer>
    </article>
  );
}

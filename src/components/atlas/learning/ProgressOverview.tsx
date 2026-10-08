import { MASTERY_META, type MasteryState, type ProgressSummary } from "@/lib/learning-engine";
import { coverageLine, depthLabel, masteryBands, masteryClass, percent } from "@/lib/learning-view";

/** The headline read on how much of the atlas someone actually holds. */
export function ProgressOverview({ summary }: { summary: ProgressSummary }) {
  const bands = masteryBands(summary.counts, summary.total);
  const legend = (["mastered", "understood", "learning", "needs-review"] as MasteryState[]).filter(
    (state) => summary.counts[state] > 0,
  );

  return (
    <section className="learn-card p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow">Where you stand</p>
          <h2 className="font-display text-2xl tracking-tight md:text-3xl">{depthLabel(summary)}</h2>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{coverageLine(summary)}</p>
      </div>

      <div className="progress-track mt-5">
        <div className="progress-fill-split">
          {bands.map((band) => (
            <span
              key={band.state}
              className={`progress-seg ${masteryClass(band.state)}`}
              style={{ width: `${band.width}%` }}
            />
          ))}
        </div>
      </div>

      {legend.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {legend.map((state) => (
            <li key={state} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`mastery-dot ${masteryClass(state)}`} />
              {MASTERY_META[state].label}
              <span className="font-mono text-foreground">{summary.counts[state]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Mark an entry anywhere in the atlas and this fills in. Nothing is sent anywhere until you
          create an account.
        </p>
      )}

      <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {summary.byLayer.map((layer) => (
          <div key={layer.layer.id} className={`layer-${layer.layer.id}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="layer-dot" />
                {layer.layer.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {layer.known}/{layer.total}
              </span>
            </div>
            <div className="progress-track mt-1.5">
              <div className="progress-fill" style={{ width: `${percent(layer.ratio)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

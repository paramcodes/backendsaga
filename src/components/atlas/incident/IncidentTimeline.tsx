import type { IncidentEvent, Symptom } from "@/domain";

/**
 * The incident as it was lived: one line per observation, in the order the
 * on-call engineer saw them, with the signal that triggered it.
 */
export function IncidentTimeline({
  timeline,
  symptoms,
}: {
  timeline: IncidentEvent[];
  symptoms: Symptom[];
}) {
  const byId = new Map(symptoms.map((symptom) => [symptom.id, symptom]));

  return (
    <ol className="incident-timeline space-y-5">
      {timeline.map((event, index) => {
        const symptom = event.symptomId ? byId.get(event.symptomId) : undefined;
        return (
          <li key={`${event.at}-${index}`} className="relative">
            <span
              aria-hidden
              className={`incident-timeline-dot ${symptom ? "incident-timeline-dot-observed" : ""}`}
            />
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {event.at}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{event.note}</p>
            {symptom && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {symptom.name} · {symptom.signal}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

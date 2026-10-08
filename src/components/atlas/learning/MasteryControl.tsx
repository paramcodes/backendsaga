import { MASTERY_META, type MasteryState } from "@/lib/learning-engine";
import { MASTERY_CHOICES, masteryClass } from "@/lib/learning-view";
import { useProgress } from "@/hooks/use-progress";
import { cn } from "@/lib/utils";

type MasteryControlProps = {
  conceptId: string;
  /** "full" spells out each state; "compact" shows initials for tight rows. */
  size?: "full" | "compact";
  className?: string;
};

const SHORT: Record<(typeof MASTERY_CHOICES)[number], string> = {
  learning: "Learning",
  understood: "Understood",
  mastered: "Mastered",
  "needs-review": "Review",
};

/**
 * The only way a reader records what they know. Marks apply instantly and are
 * kept in this browser; with an account they follow the reader around.
 */
export function MasteryControl({ conceptId, size = "full", className }: MasteryControlProps) {
  const { stateOf, setState, ready } = useProgress();
  const current = stateOf(conceptId);

  return (
    <div
      className={cn("mastery-control", className)}
      role="group"
      aria-label="What you know about this entry"
    >
      {MASTERY_CHOICES.map((choice) => {
        const active = current === choice;
        return (
          <button
            key={choice}
            type="button"
            aria-pressed={active}
            disabled={!ready}
            title={MASTERY_META[choice].blurb}
            onClick={() => setState(conceptId, active ? "unknown" : (choice as MasteryState))}
            className={cn("mastery-option", masteryClass(choice), !ready && "opacity-50")}
          >
            <span className="mastery-dot" />
            {size === "full" ? MASTERY_META[choice].action : SHORT[choice]}
          </button>
        );
      })}
      {current !== "unknown" && (
        <button
          type="button"
          onClick={() => setState(conceptId, "unknown")}
          className="mastery-option"
          title="Remove this mark"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** Read-only badge for lists and panels. */
export function MasteryBadge({ state, className }: { state: MasteryState; className?: string }) {
  if (state === "unknown") return null;
  return (
    <span className={cn("mastery-chip", masteryClass(state), className)}>
      <span className="mastery-dot" />
      {MASTERY_META[state].label}
    </span>
  );
}

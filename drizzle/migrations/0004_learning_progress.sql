-- Phase 9: per-user mastery states. A missing row means "unknown", so the table
-- only ever holds states the learner actually set.
CREATE TABLE IF NOT EXISTS public.learning_progress (
  user_id uuid NOT NULL,
  concept_id text NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  state text NOT NULL CHECK (state IN ('learning', 'understood', 'mastered', 'needs-review')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concept_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_progress TO authenticated;
GRANT ALL ON public.learning_progress TO service_role;

ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learners read their own progress" ON public.learning_progress;
CREATE POLICY "Learners read their own progress"
  ON public.learning_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Learners record their own progress" ON public.learning_progress;
CREATE POLICY "Learners record their own progress"
  ON public.learning_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Learners update their own progress" ON public.learning_progress;
CREATE POLICY "Learners update their own progress"
  ON public.learning_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Learners delete their own progress" ON public.learning_progress;
CREATE POLICY "Learners delete their own progress"
  ON public.learning_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS learning_progress_concept_idx ON public.learning_progress (concept_id);

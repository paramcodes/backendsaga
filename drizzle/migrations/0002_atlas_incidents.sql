-- Phase 7: the incident layer.
--
-- Symptoms are observations ("p99 is up"), never causes. A symptom reaches the
-- knowledge graph only through evidence cards, so every diagnosis can be read
-- back as "this signal, on this card, on this concept". Incidents are worked
-- scenarios: a narrative, a timeline of observations, and a documented root
-- cause used as the answer key when replaying the deterministic engine.

-- ---------------------------------------------------------------- symptoms --
CREATE TABLE IF NOT EXISTS public.symptoms (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  layer_id    text NOT NULL REFERENCES public.layers (id) ON UPDATE CASCADE,
  description text NOT NULL,
  signal      text NOT NULL,
  trend       text NOT NULL CHECK (trend IN ('UP', 'DOWN', 'SPIKE', 'FLAT', 'PRESENT'))
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.symptoms FROM anon, authenticated;
GRANT SELECT ON public.symptoms TO anon, authenticated;
GRANT ALL ON public.symptoms TO service_role;
ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Symptoms are public knowledge" ON public.symptoms;
CREATE POLICY "Symptoms are public knowledge"
  ON public.symptoms FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS symptoms_layer_id_idx ON public.symptoms (layer_id);

-- ------------------------------------------------------- symptom_evidence --
-- DIRECT: the card *is* the observation. SUPPORTING: the card is consistent
-- with it but could be produced by something else.
CREATE TABLE IF NOT EXISTS public.symptom_evidence (
  symptom_id  text NOT NULL REFERENCES public.symptoms (id) ON DELETE CASCADE ON UPDATE CASCADE,
  evidence_id text NOT NULL REFERENCES public.evidence (id) ON DELETE CASCADE ON UPDATE CASCADE,
  strength    text NOT NULL CHECK (strength IN ('DIRECT', 'SUPPORTING')),
  PRIMARY KEY (symptom_id, evidence_id)
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.symptom_evidence FROM anon, authenticated;
GRANT SELECT ON public.symptom_evidence TO anon, authenticated;
GRANT ALL ON public.symptom_evidence TO service_role;
ALTER TABLE public.symptom_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Symptom evidence is public knowledge" ON public.symptom_evidence;
CREATE POLICY "Symptom evidence is public knowledge"
  ON public.symptom_evidence FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS symptom_evidence_evidence_id_idx
  ON public.symptom_evidence (evidence_id);

-- --------------------------------------------------------------- incidents --
-- The table was created empty in 0000 as an anchor; it gains its real shape
-- here.
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS slug             text,
  ADD COLUMN IF NOT EXISTS narrative        text,
  ADD COLUMN IF NOT EXISTS symptom_ids      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS timeline         jsonb  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS root_cause_id    text,
  ADD COLUMN IF NOT EXISTS contributing_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution       text,
  ADD COLUMN IF NOT EXISTS lesson           text,
  ADD COLUMN IF NOT EXISTS sort_order       integer NOT NULL DEFAULT 0;

UPDATE public.incidents SET slug = id WHERE slug IS NULL;
UPDATE public.incidents SET narrative = summary WHERE narrative IS NULL;
UPDATE public.incidents SET resolution = '' WHERE resolution IS NULL;
UPDATE public.incidents SET lesson = '' WHERE lesson IS NULL;
DELETE FROM public.incidents WHERE root_cause_id IS NULL;

ALTER TABLE public.incidents
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN narrative SET NOT NULL,
  ALTER COLUMN root_cause_id SET NOT NULL,
  ALTER COLUMN resolution SET NOT NULL,
  ALTER COLUMN lesson SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_slug_key'
  ) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_slug_key UNIQUE (slug);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_root_cause_id_fkey'
  ) THEN
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_root_cause_id_fkey
      FOREIGN KEY (root_cause_id) REFERENCES public.concepts (id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_symptom_ids_not_empty'
  ) THEN
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_symptom_ids_not_empty
      CHECK (cardinality(symptom_ids) > 0);
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.incidents FROM anon, authenticated;
GRANT SELECT ON public.incidents TO anon, authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Incidents are public knowledge" ON public.incidents;
CREATE POLICY "Incidents are public knowledge"
  ON public.incidents FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS incidents_root_cause_id_idx ON public.incidents (root_cause_id);
CREATE INDEX IF NOT EXISTS incidents_severity_idx ON public.incidents (severity);

-- ----------------------------------------------------------------- stats ----
-- atlas_stats() gains the incident counters so the dashboard stays one call.
CREATE OR REPLACE FUNCTION public.atlas_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'layers',              (SELECT count(*) FROM public.layers),
    'concepts',            (SELECT count(*) FROM public.concepts),
    'relationships',       (SELECT count(*) FROM public.relationships),
    'evidence',            (SELECT count(*) FROM public.evidence),
    'sources',             (SELECT count(*) FROM public.sources),
    'symptoms',            (SELECT count(*) FROM public.symptoms),
    'incidents',           (SELECT count(*) FROM public.incidents),
    'conceptsWithEvidence',(SELECT count(DISTINCT concept_id) FROM public.evidence),
    'conceptsWithSources', (SELECT count(DISTINCT concept_id) FROM public.concept_sources),
    'byLayer',             (SELECT coalesce(jsonb_object_agg(layer_id, n), '{}'::jsonb)
                            FROM (SELECT layer_id, count(*) AS n
                                  FROM public.concepts GROUP BY layer_id) t)
  );
$$;

GRANT EXECUTE ON FUNCTION public.atlas_stats() TO anon, authenticated, service_role;

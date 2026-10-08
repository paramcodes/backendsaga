-- Backend Atlas: the knowledge base moves into PostgreSQL.
--
-- These tables mirror the curated domain model in src/domain/seed/* , which
-- stays the authoring surface. The database is the runtime read path: public,
-- read-only knowledge. anon/authenticated may SELECT; no write policy exists,
-- so content changes only through migrations and the seed script running as
-- service_role.

-- ---------------------------------------------------------------- layers
CREATE TABLE public.layers (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  sort_order  integer NOT NULL UNIQUE CHECK (sort_order > 0),
  description text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.layers TO anon, authenticated;
GRANT ALL ON public.layers TO service_role;
ALTER TABLE public.layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Layers are public knowledge"
  ON public.layers FOR SELECT TO anon, authenticated USING (true);

-- -------------------------------------------------------------- concepts
CREATE TABLE public.concepts (
  id                 text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text NOT NULL,
  layer_id           text NOT NULL REFERENCES public.layers(id) ON UPDATE CASCADE,
  description        text NOT NULL,
  problem            text,
  why                text,
  mechanism          text,
  tradeoffs          text,
  better_alternative text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- One lowercase haystack for substring search; kept in sync by Postgres.
  search_text        text GENERATED ALWAYS AS (
    lower(
      name || ' ' || description || ' ' ||
      coalesce(problem, '') || ' ' || coalesce(why, '') || ' ' ||
      coalesce(mechanism, '') || ' ' || coalesce(tradeoffs, '') || ' ' ||
      coalesce(better_alternative, '')
    )
  ) STORED
);
CREATE INDEX concepts_layer_id_idx ON public.concepts (layer_id);
CREATE INDEX concepts_name_idx ON public.concepts (lower(name));
GRANT SELECT ON public.concepts TO anon, authenticated;
GRANT ALL ON public.concepts TO service_role;
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Concepts are public knowledge"
  ON public.concepts FOR SELECT TO anon, authenticated USING (true);

-- --------------------------------------------------------- relationships
CREATE TABLE public.relationships (
  id         text PRIMARY KEY,
  source_id  text NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  target_id  text NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  type       text NOT NULL CHECK (type IN (
    'CAUSES','AMPLIFIES','MITIGATES','DEPENDS_ON','TRADEOFF_OF','ALTERNATIVE_TO','OBSERVED_BY','REQUIRES'
  )),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationships_no_self_loop CHECK (source_id <> target_id),
  CONSTRAINT relationships_unique_edge UNIQUE (source_id, type, target_id)
);
CREATE INDEX relationships_source_idx ON public.relationships (source_id);
CREATE INDEX relationships_target_idx ON public.relationships (target_id);
GRANT SELECT ON public.relationships TO anon, authenticated;
GRANT ALL ON public.relationships TO service_role;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Relationships are public knowledge"
  ON public.relationships FOR SELECT TO anon, authenticated USING (true);

-- --------------------------------------------------------------- sources
CREATE TABLE public.sources (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind       text NOT NULL CHECK (kind IN ('BOOK','PAPER','RFC','DOCS','ARTICLE','SPEC','TALK')),
  title      text NOT NULL,
  author     text NOT NULL,
  year       integer CHECK (year IS NULL OR (year BETWEEN 1960 AND 2100)),
  url        text NOT NULL CHECK (url ~ '^https?://'),
  note       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sources_kind_idx ON public.sources (kind);
GRANT SELECT ON public.sources TO anon, authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sources are public knowledge"
  ON public.sources FOR SELECT TO anon, authenticated USING (true);

-- -------------------------------------------------------------- evidence
CREATE TABLE public.evidence (
  id             text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  concept_id     text NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('METRIC','LOG','TRACE','PROFILE','QUERY_PLAN','PACKET','OS_COUNTER')),
  trend          text NOT NULL CHECK (trend IN ('UP','DOWN','SPIKE','FLAT','PRESENT')),
  signal         text NOT NULL,
  what_you_see   text NOT NULL,
  where_to_look  text NOT NULL,
  why_it_matters text NOT NULL,
  false_positive text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_concept_idx ON public.evidence (concept_id);
CREATE INDEX evidence_kind_idx ON public.evidence (kind);
GRANT SELECT ON public.evidence TO anon, authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Evidence is public knowledge"
  ON public.evidence FOR SELECT TO anon, authenticated USING (true);

-- ------------------------------------------------------- concept_sources
CREATE TABLE public.concept_sources (
  concept_id text NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  source_id  text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE ON UPDATE CASCADE,
  relevance  text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (concept_id, source_id)
);
CREATE INDEX concept_sources_source_idx ON public.concept_sources (source_id);
GRANT SELECT ON public.concept_sources TO anon, authenticated;
GRANT ALL ON public.concept_sources TO service_role;
ALTER TABLE public.concept_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Concept sources are public knowledge"
  ON public.concept_sources FOR SELECT TO anon, authenticated USING (true);

-- ------------------------------------------------------------- incidents
-- The anchor for Phase 7. Scenarios are seeded there; the table exists now so
-- the schema is complete and foreign keys can point at it.
CREATE TABLE public.incidents (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title      text NOT NULL,
  summary    text NOT NULL,
  severity   text NOT NULL DEFAULT 'SEV3' CHECK (severity IN ('SEV1','SEV2','SEV3','SEV4')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.incidents TO anon, authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Incidents are public knowledge"
  ON public.incidents FOR SELECT TO anon, authenticated USING (true);

-- --------------------------------------------------- graph traversal (SQL)
-- Breadth-first walk over the undirected edge set, returning the smallest
-- number of hops from the starting concept. UNION (not UNION ALL) keeps the
-- recursion finite on a cyclic graph.
CREATE OR REPLACE FUNCTION public.concept_neighborhood(p_concept_id text, p_depth integer DEFAULT 2)
RETURNS TABLE (concept_id text, hops integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE bounds AS (
    SELECT least(greatest(coalesce(p_depth, 2), 1), 4) AS max_hops
  ),
  walk AS (
    SELECT p_concept_id AS concept_id, 0 AS hops
    UNION
    SELECT
      CASE WHEN r.source_id = w.concept_id THEN r.target_id ELSE r.source_id END,
      w.hops + 1
    FROM walk w
    JOIN public.relationships r
      ON r.source_id = w.concept_id OR r.target_id = w.concept_id
    CROSS JOIN bounds b
    WHERE w.hops < b.max_hops
  )
  SELECT w.concept_id, min(w.hops)::integer AS hops
  FROM walk w
  JOIN public.concepts c ON c.id = w.concept_id
  GROUP BY w.concept_id
  ORDER BY 2, 1;
$$;
GRANT EXECUTE ON FUNCTION public.concept_neighborhood(text, integer) TO anon, authenticated, service_role;

-- --------------------------------------------------------------- stats
CREATE OR REPLACE FUNCTION public.atlas_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'layers', (SELECT count(*) FROM public.layers),
    'concepts', (SELECT count(*) FROM public.concepts),
    'relationships', (SELECT count(*) FROM public.relationships),
    'evidence', (SELECT count(*) FROM public.evidence),
    'sources', (SELECT count(*) FROM public.sources),
    'conceptsWithEvidence', (SELECT count(DISTINCT concept_id) FROM public.evidence),
    'conceptsWithSources', (SELECT count(DISTINCT concept_id) FROM public.concept_sources),
    'byLayer', (
      SELECT coalesce(jsonb_object_agg(l.id, c.n), '{}'::jsonb)
      FROM public.layers l
      LEFT JOIN LATERAL (
        SELECT count(*) AS n FROM public.concepts WHERE layer_id = l.id
      ) c ON true
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.atlas_stats() TO anon, authenticated, service_role;
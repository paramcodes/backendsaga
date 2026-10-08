-- The knowledge catalogue is authored in the repository and written only by the
-- seeding script (service role). Row Level Security already blocks public
-- writes, but the project's default privileges still hand anon/authenticated
-- full table privileges, so a write reaches Postgres before RLS rejects it.
-- Revoke the write privileges outright and keep SELECT: defence in depth, and
-- the Data API now answers an anonymous write with a hard permission error.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.layers, public.concepts, public.relationships, public.sources,
     public.evidence, public.concept_sources, public.incidents
  FROM anon, authenticated;

GRANT SELECT ON public.layers, public.concepts, public.relationships, public.sources,
                public.evidence, public.concept_sources, public.incidents
  TO anon, authenticated;

GRANT ALL ON public.layers, public.concepts, public.relationships, public.sources,
             public.evidence, public.concept_sources, public.incidents
  TO service_role;
